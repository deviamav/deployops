-- DeployOps terminology: Domain.status "deployed" is now "deployed".
UPDATE "Domain" SET "status" = 'deployed' WHERE "status" = 'deployed';
