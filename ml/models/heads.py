"""Masked feature stem, cosine classification and CTC task heads."""
import torch
from torch import nn
from torch.nn import functional as F


class MaskedLayerNorm(nn.LayerNorm):
    def forward(self, x, mask):
        return super().forward(x) * mask.unsqueeze(-1)


class LandmarkStem(nn.Module):
    def __init__(self, input_dim=174, d_model=192, dropout=.1):
        super().__init__()
        self.input_dim = input_dim
        width = 368 if input_dim == 174 else input_dim * 2
        self.norm = MaskedLayerNorm(width)
        self.proj = nn.Linear(width, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, mask):
        previous = F.pad(x[:, :-1], (0, 0, 1, 0))
        valid_previous = F.pad(mask[:, :-1], (1, 0), value=False)
        velocity = (x - previous) * (mask & valid_previous).unsqueeze(-1)
        features = [x, velocity]
        if self.input_dim == 174:
            # Five wrist-to-tip lengths and planar angles for each real XY hand.
            bones = []
            for start in (0, 84):
                hand = x[:, :, start:start+42].reshape(x.shape[0], x.shape[1], 21, 2)
                vectors = hand[:, :, [4, 8, 12, 16, 20]] - hand[:, :, :1]
                present = x[:, :, 172 + start//84:start//84+173]
                lengths = (vectors.square().sum(-1) + 1e-8).sqrt() * present
                # atan2(0,0) has undefined gradients: give missing bones a safe x.
                vx, vy = vectors[..., 0], vectors[..., 1]
                safe_x = torch.where(vectors.square().sum(-1) > 1e-12, vx, torch.ones_like(vx))
                angles = torch.atan2(vy, safe_x) * present
                bones.extend([lengths, angles])
            features.extend(bones)
        z = torch.cat(features, -1)
        return self.dropout(self.proj(self.norm(z, mask))) * mask.unsqueeze(-1)


class IsolatedAttentiveClassifierHead(nn.Module):
    def __init__(self, d_model, num_classes, scale=24., margin=.15):
        super().__init__()
        self.attention = nn.Linear(d_model, 1)
        self.empty_embedding = nn.Parameter(torch.randn(d_model) * .02)
        self.weight = nn.Parameter(torch.empty(num_classes, d_model))
        nn.init.xavier_uniform_(self.weight)
        self.register_buffer('scale', torch.tensor(float(scale)))
        self.margin = margin
        self.activity = nn.Linear(d_model, 1)

    def forward(self, x, mask, targets=None):
        scores = self.attention(x).squeeze(-1).masked_fill(~mask, -1e4)
        weights = scores.softmax(-1) * mask
        weights = weights / weights.sum(-1, keepdim=True).clamp_min(1e-8)
        pooled = (x * weights.unsqueeze(-1)).sum(1)
        pooled = torch.where(mask.any(1, keepdim=True), pooled, self.empty_embedding[None])
        cosine = F.linear(F.normalize(pooled, dim=-1), F.normalize(self.weight, dim=-1))
        if targets is not None:
            cosine = cosine - self.margin * F.one_hot(targets, self.weight.shape[0])
        return {'logits': cosine * self.scale, 'hand_activity_logit': self.activity(pooled).squeeze(-1)}


class FingerspellingCTCHead(nn.Module):
    def __init__(self, d_model, num_chars=40):
        super().__init__()
        self.linear = nn.Linear(d_model, num_chars)
        self.register_buffer('scale', torch.tensor(1.))

    def forward(self, x, mask, targets=None):
        return {'logits': self.linear(x) * self.scale}


def classification_loss(logits, targets, counts, smoothing=.1, tau=.5, gamma=2.):
    prior = counts.to(logits).clamp_min(1)
    adjusted = logits + tau * (prior / prior.sum()).log()
    ce = F.cross_entropy(adjusted, targets, label_smoothing=smoothing, reduction='none')
    probability = adjusted.softmax(-1).gather(1, targets[:, None]).squeeze(1)
    return ((1 - probability).pow(gamma) * ce).mean()
