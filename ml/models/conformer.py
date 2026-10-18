"""Conformer encoder with relative bias and padding-safe temporal operations."""
import math
import torch
from torch import nn
from torch.nn import functional as F
from .heads import LandmarkStem, IsolatedAttentiveClassifierHead, FingerspellingCTCHead


class RelativeAttention(nn.Module):
    def __init__(self, width, heads=4, max_len=128, dropout=.1):
        super().__init__()
        self.heads, self.dim, self.max_len = heads, width//heads, max_len
        self.qkv = nn.Linear(width, width*3)
        self.output = nn.Linear(width, width)
        self.bias = nn.Parameter(torch.zeros(2*max_len-1, heads))
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, mask):
        b, t, width = x.shape
        q, k, v = self.qkv(x).reshape(b, t, 3, self.heads, self.dim).permute(2, 0, 3, 1, 4).unbind(0)
        positions = torch.arange(t, device=x.device)
        relative = (positions[:, None] - positions[None, :]).clamp(1-self.max_len, self.max_len-1)
        bias = self.bias[relative+self.max_len-1].permute(2, 0, 1)
        scores = q @ k.transpose(-1, -2) / math.sqrt(self.dim) + bias
        weights = scores.masked_fill(~mask[:, None, None, :], -1e4).softmax(-1)
        weights = weights * mask[:, None, None, :]
        weights = weights / weights.sum(-1, keepdim=True).clamp_min(1e-8)
        z = (self.dropout(weights) @ v).transpose(1, 2).reshape(b, t, width)
        return self.output(z) * mask.unsqueeze(-1)


class ConformerBlock(nn.Module):
    def __init__(self, width=192, heads=4, kernel=7, dropout=.1):
        super().__init__()
        def ffn():
            return nn.Sequential(nn.LayerNorm(width), nn.Linear(width, width*2), nn.SiLU(),
                                 nn.Dropout(dropout), nn.Linear(width*2, width), nn.Dropout(dropout))
        self.ff1, self.ff2 = ffn(), ffn()
        self.attn_norm = nn.LayerNorm(width)
        self.attention = RelativeAttention(width, heads, dropout=dropout)
        self.conv_norm = nn.LayerNorm(width)
        self.point_in = nn.Conv1d(width, width*2, 1)
        self.depthwise = nn.Conv1d(width, width, kernel, padding=kernel//2, groups=width)
        # LayerNorm across channels avoids BatchNorm statistics from padded frames.
        self.channel_norm = nn.LayerNorm(width)
        self.point_out = nn.Conv1d(width, width, 1)
        self.dropout, self.final_norm = nn.Dropout(dropout), nn.LayerNorm(width)

    def forward(self, x, mask):
        keep = mask.unsqueeze(-1)
        x = (x + .5*self.ff1(x)) * keep
        x = (x + self.attention(self.attn_norm(x), mask)) * keep
        z = F.glu(self.point_in((self.conv_norm(x)*keep).transpose(1, 2)), dim=1)
        z = self.depthwise(z * mask.unsqueeze(1)).transpose(1, 2)
        z = F.silu(self.channel_norm(z)) * keep
        z = self.point_out(z.transpose(1, 2)).transpose(1, 2)
        x = (x + self.dropout(z)) * keep
        return self.final_norm(x + .5*self.ff2(x)) * keep


class SignConformerV2(nn.Module):
    def __init__(self, num_classes, input_dim=174, stage='c1_commercial_250', d_model=192, num_layers=4, dropout=.1):
        super().__init__()
        self.ctc = stage == 'b_fingerspelling'
        self.stem = LandmarkStem(input_dim, d_model, dropout)
        self.blocks = nn.ModuleList([ConformerBlock(d_model, dropout=dropout) for _ in range(num_layers)])
        self.head = (FingerspellingCTCHead(d_model, num_classes) if stage == 'b_fingerspelling'
                     else IsolatedAttentiveClassifierHead(d_model, num_classes))

    def forward(self, x, lengths=None, targets=None):
        if lengths is None:
            mask = x.abs().sum(-1) > 0
        else:
            mask = torch.arange(x.shape[1], device=x.device)[None] < lengths[:, None]
        if not self.ctc:
            mask = mask & (x.abs().sum(-1) > 0)
        z = self.stem(x * mask.unsqueeze(-1), mask)
        for block in self.blocks:
            z = block(z, mask)
        return self.head(z, mask, targets)


class FingerspellingCTCMini(SignConformerV2):
    def __init__(self, num_classes=40, **kwargs):
        super().__init__(num_classes, input_dim=90, stage='b_fingerspelling', **kwargs)
