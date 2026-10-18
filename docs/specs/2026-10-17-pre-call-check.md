# Pre-call camera and microphone check

Scope agreed in chat: camera/microphone checks before a conversation; recorder deferred. Preserve rooms, captions and role behavior. No ASL recognition work.

The room tab opens a local pre-call screen instead of connecting automatically. Camera starts on an explicit button. Hearing participants also test their microphone with a local level meter; signers need only the camera and never request microphone access. Successful checks enable Join conversation. Joining releases test resources before the existing call flow acquires the devices. No room token or media publication happens during checks. Cancel, navigation, pagehide, denied access and late permission responses release resources. Rejoining returns through checks.

Use existing UI surfaces, buttons, tokens and responsive two-column camera/sidebar layout. Show readable permission errors and retry controls. Keep device defaults consistent with the existing call; device selection and recording are outside this change.

Acceptance: direct room URLs show checks, no automatic device access; independent camera/mic failures remain retryable; hearing joins require live camera and mic, signer joins require only live camera; stopped/disconnected tracks disable Join; late grants cannot leak media; call names and room IDs remain unchanged. Real-device preview/audio and two-person calls require desktop browser checks.
