from app.gloss import GlossRequest, render


def test_render_lists_alts_tags_and_context():
    req = GlossRequest(
        signs=[{"gloss": "YOU", "p": 0.91},
               {"gloss": "NAME", "p": 0.55, "alts": [{"gloss": "CHAIR", "p": 0.3}]},
               {"gloss": "WHAT", "p": 0.88}],
        tags=["Q-WH"], context=["Hi, I'm Priya"])
    text = render(req)
    assert "2. NAME (0.55) alts: CHAIR (0.30)" in text
    assert "FACE TAGS: Q-WH" in text
    assert "Hi, I'm Priya" in text
