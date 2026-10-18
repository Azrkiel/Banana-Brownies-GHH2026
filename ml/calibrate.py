"""Validation-only positive temperature fitting for classification and CTC."""
import math
import torch
from torch.nn import functional as F


def expected_calibration_error(logits, targets, bins=15):
    probabilities = logits.softmax(-1)
    confidence, prediction = probabilities.max(-1)
    accuracy = prediction.eq(targets).float()
    error = logits.new_tensor(0.)
    for i in range(bins):
        selected = (confidence > i/bins) & (confidence <= (i+1)/bins)
        if selected.any():
            error = error + selected.float().mean() * (confidence[selected].mean() - accuracy[selected].mean()).abs()
    return float(error)


def fit_temperature(logits, targets, lengths=None, target_lengths=None):
    logits, targets = logits.detach().double(), targets.detach()
    log_temperature = torch.zeros((), dtype=torch.float64, requires_grad=True, device=logits.device)
    def objective(temperature):
        scaled = logits / temperature
        if target_lengths is None:
            return F.cross_entropy(scaled, targets)
        return F.ctc_loss(scaled.log_softmax(-1).transpose(0,1), targets, lengths,
                          target_lengths, blank=0, zero_infinity=False)
    optimizer = torch.optim.LBFGS([log_temperature], lr=.25, max_iter=50, line_search_fn='strong_wolfe')
    before = float(objective(1.).detach())
    def closure():
        optimizer.zero_grad()
        loss = objective(log_temperature.clamp(-4.6, 4.6).exp())
        loss.backward()
        return loss
    optimizer.step(closure)
    temperature = float(log_temperature.detach().clamp(-4.6, 4.6).exp())
    after = float(objective(temperature).detach())
    if not math.isfinite(after) or after > before:
        temperature, after = 1., before
    result = dict(temperature=temperature, nll_before=before, nll_after=after)
    if target_lengths is None:
        result.update(ece_before=expected_calibration_error(logits,targets),
                      ece_after=expected_calibration_error(logits/temperature, targets))
    return result


def bake_temperature(model, temperature):
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError('Temperature must be positive and finite')
    with torch.no_grad():
        model.head.scale.div_(temperature)
