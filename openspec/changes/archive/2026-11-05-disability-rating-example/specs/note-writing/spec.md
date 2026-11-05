# Spec Delta

## ADDED Requirements

### Requirement: Notes can be authored and signed by a synthetic provider
The system SHALL allow a note to be created and signed as a synthetic provider other than
the PIV user. The author DUZ SHALL be set per note (default from `VISTA_AUTHOR_DUZ`, else
`VISTA_DUZ`). When it differs from the PIV user's DUZ, the system SHALL create the note
through the vista-api-x service account running as the author, and SHALL sign it with
`TIU SIGN RECORD` as the author using the shared e-signature code from config.

#### Scenario: Other author, same signing path
- **WHEN** a note's `duz` differs from the PIV DUZ and `--sign` is passed
- **THEN** the note is created and signed as that DUZ, and reading it back shows that provider as author with a signature block of the form `/es/ <name>`

#### Scenario: PIV author unchanged
- **WHEN** a note's `duz` equals the PIV DUZ
- **THEN** creation and signing use the PIV session exactly as before

#### Scenario: Missing credentials
- **WHEN** the service account key or the e-signature code is not configured
- **THEN** the run stops with a message naming the missing setting, and no note is created

### Requirement: Fallback signing as the author
The system SHALL provide a dev-only RPC, `CDSP UTIL TIU SIGN AS`, that signs an UNSIGNED
note without expected cosigner as the note's own author. It SHALL be a dry run unless
told to apply, SHALL refuse to run on a production system, and SHALL refuse a signer who
is not the note's author. When an encrypted e-signature code is supplied it SHALL be
checked against the signer's stored code and nothing SHALL be signed on a mismatch. The
signature block it files SHALL match the format TIU itself writes.

#### Scenario: Wrong signer refused
- **WHEN** the signer is not the note's author
- **THEN** the RPC returns an error and the note stays unsigned

#### Scenario: E-signature mismatch
- **WHEN** a code is supplied that does not match the signer's stored code
- **THEN** the RPC returns an error and the note stays unsigned

#### Scenario: Signed block matches TIU
- **WHEN** a note is signed through the RPC
- **THEN** reading it back shows `/es/ <name>` and its title, like a normally signed note
