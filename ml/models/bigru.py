"""Multi-scale CNN and packed two-layer BiGRU baseline."""
import torch
from torch import nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence
from .heads import LandmarkStem, IsolatedAttentiveClassifierHead, FingerspellingCTCHead


class SignBiGRUV2(nn.Module):
    def __init__(self, num_classes, input_dim=174, stage='c1_commercial_250', d_model=192, dropout=.1, **kwargs):
        super().__init__()
        self.ctc = stage == 'b_fingerspelling'
        self.stem = LandmarkStem(input_dim, d_model, dropout)
        self.convs = nn.ModuleList([nn.Conv1d(d_model, d_model//3, k, padding=k//2) for k in (3, 5, 7)])
        self.gru = nn.GRU(d_model, d_model//2, num_layers=2, dropout=dropout, bidirectional=True, batch_first=True)
        self.head = (FingerspellingCTCHead(d_model, num_classes) if stage == 'b_fingerspelling'
                     else IsolatedAttentiveClassifierHead(d_model, num_classes))

    def forward(self, x, lengths=None, targets=None):
        if lengths is None:
            lengths = ((x.abs().sum(-1) > 0) * (torch.arange(x.shape[1], device=x.device)[None]+1)).max(1).values
        mask = torch.arange(x.shape[1], device=x.device)[None] < lengths[:, None]
        if not self.ctc:
            mask = mask & (x.abs().sum(-1) > 0)
        z = self.stem(x*mask.unsqueeze(-1), mask).transpose(1, 2)
        z = torch.cat([torch.nn.functional.silu(conv(z)) for conv in self.convs], 1).transpose(1, 2) * mask.unsqueeze(-1)
        packed = pack_padded_sequence(z, lengths.clamp_min(1).cpu(), batch_first=True, enforce_sorted=False)
        packed, _ = self.gru(packed)
        z, _ = pad_packed_sequence(packed, batch_first=True, total_length=x.shape[1])
        return self.head(z*mask.unsqueeze(-1), mask, targets)
