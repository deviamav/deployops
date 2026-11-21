-- DeployOps terminology: Domain.status "cloaked" is now "deployed".
UPDATE "Domain" SET "status" = 'deployed' WHERE "status" = 'cloaked';
