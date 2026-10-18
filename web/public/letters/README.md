# Built-in letter fallback

`model.json`, `group1-shard1of1.bin` and `labels.json` are the TF.js export of
[AmimulBmeIU/asl-alphabet-classifier](https://huggingface.co/AmimulBmeIU/asl-alphabet-classifier) (MIT):
a small dense network over 21 MediaPipe hand landmarks for the 24 static letters (no J, Z).
`web/src/lib/letterModel.ts` runs its three layers in plain JavaScript.

Measured on 415 public alphabet photos of people it was not trained on: about 47% correct.
It is only the fallback for letters the signer has not taught; taught letters scored 96% (K/E/V)
in the same test.
