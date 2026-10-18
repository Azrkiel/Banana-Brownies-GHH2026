"""Stage-aware registry; browser inputs remain XY174 or ASLFR90."""
from .conformer import SignConformerV2, FingerspellingCTCMini
from .bigru import SignBiGRUV2

STAGES = ('b_fingerspelling', 'c1_commercial_250', 'c2_research_2731')


def build_model(arch='conformer', stage='c1_commercial_250', num_classes=251, **kwargs):
    if stage not in STAGES or arch not in ('conformer', 'bigru'):
        raise ValueError('Unknown architecture or stage')
    model = SignConformerV2 if arch == 'conformer' else SignBiGRUV2
    return model(num_classes, input_dim=90 if stage == 'b_fingerspelling' else 174, stage=stage, **kwargs)
