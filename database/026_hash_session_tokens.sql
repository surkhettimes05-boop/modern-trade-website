-- Preserve currently issued browser tokens while replacing replayable database
-- values with one-way digests. pgcrypto is part of the schema baseline.
UPDATE customer_sessions
   SET session_token = encode(sha256(convert_to(session_token, 'UTF8')), 'hex')
 WHERE session_token !~ '^[a-f0-9]{64}$';

UPDATE sessions
   SET session_token = encode(sha256(convert_to(session_token, 'UTF8')), 'hex')
 WHERE session_token !~ '^[a-f0-9]{64}$';
