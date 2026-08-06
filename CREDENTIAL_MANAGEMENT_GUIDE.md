# How to Change Admin Username and Password

## Overview

This guide explains how to change the default admin username and password for the RWA Backend application deployed on Azure Container Apps.

**Current Credentials (as of March 27, 2026):**
- Username: `rwa-user12345`
- Password: `<admin-password>`

---

## Method 1: Via Environment Variables (Recommended)

This is the **simplest and most reliable method** for changing credentials before or after deployment.

### Step 1: Update Container App Environment Variables

```bash
# Set subscription and resource group variables
SUB="95d9bb5b-4111-407d-9ef1-a0ada1962b0b"
RG="rg-rwa-dev-westus2"
BACKEND_APP="rwa-backend-dev"

# Update the backend container app with new credentials
az containerapp update -n "$BACKEND_APP" -g "$RG" \
  --set-env-vars \
    ADMIN_USERNAME="mynewusername" \
    ADMIN_PASSWORD="mynewpassword123"
```

**What this command does:**
- Updates the `ADMIN_USERNAME` environment variable
- Updates the `ADMIN_PASSWORD` environment variable
- Creates a **new revision** of the container app automatically
- The new revision will seed the database with the new credentials on startup

### Step 2: Verify the New Revision is Active

```bash
# List all revisions
az containerapp revision list -n "$BACKEND_APP" -g "$RG" -o table
```

**Example output:**
```
CreatedTime                Active    Replicas    TrafficWeight    HealthState    ProvisioningState    Name
-------------------------  --------  ----------  ---------------  -------------  -------------------  
2026-03-27T17:52:52+00:00  True      1           100              Healthy        Provisioned          rwa-backend-dev--0000009
2026-03-27T17:43:20+00:00  False     0           0                Healthy        Provisioned          rwa-backend-dev--0000008
```

**What to look for:**
- `Active: True` = This revision is running
- `TrafficWeight: 100` = All traffic goes to this revision
- `HealthState: Healthy` = Revision is working properly

### Step 3: Test Login with New Credentials

```bash
# Test login with new credentials
curl -X POST https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"mynewusername","password":"mynewpassword123"}'
```

**Expected response:**
```json
{
  "token": "eyJzdWIiOiJteW5ld3VzZXJuYW1lIn0.acbEgw.GlYDmsg...",
  "username": "mynewusername"
}
```

**If successful:**
- ✅ You'll receive a JWT `token` and your `username`
- ✅ Status code: `200 OK`

**If failed:**
- ❌ You'll get `{"detail":"Not authenticated"}` with status `401`
- This means the old credentials are still active; wait a few minutes for the new revision to fully activate

---

## Understanding the Database Seeding Process

### How It Works

1. **Environment Variables Read:** On container startup, the backend checks for `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars
2. **Database Check:** Looks in SQLite database to see if the admin user already exists
3. **User Creation:** If the user doesn't exist, it creates one with hashed password
4. **If User Exists:** New env vars are ignored (the existing user is preserved)

### Source Code Reference

**File:** `backend/database.py`, lines 856-868

```python
def seed_default_user():
    """Create the default admin user from env vars if it doesn't exist yet."""
    import os
    from passlib.context import CryptContext
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    if get_user(admin_username) is None:
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        create_user(admin_username, pwd_context.hash(admin_password))
        print(f"[auth] Seeded default user '{admin_username}'")
```

**Key points:**
- Default falls back to `"admin"` / `"admin123"` if env vars aren't set
- Uses `bcrypt` for secure password hashing
- Only creates user if it doesn't already exist
- Password is **never stored in plaintext**; only the hash is saved

---

## What NOT to Do

❌ **Don't change the password directly in the database file**
- The database lives in the container's `/data` directory
- Without persistent storage (Azure Files), data is lost on restart anyway
- Hard to access from outside the container

❌ **Don't try to change env vars on running containers**
- Container Apps uses immutable container instances
- Env var changes always create a new revision

❌ **Don't use plain text passwords in the update command**
- While our example shows plain text for clarity, in production use Azure Key Vault

---

## Best Practices

### 1. Use Azure Key Vault for Passwords

Instead of passing secrets as plain text, store them in Key Vault:

```bash
# Create a secret in Key Vault
az keyvault secret set \
  --vault-name your-keyvault \
  --name rwa-admin-password \
  --value "your-secret-password"

# Reference it in container app
az containerapp update -n "$BACKEND_APP" -g "$RG" \
  --set-env-vars ADMIN_PASSWORD=secretref:rwa-admin-password
```

### 2. Secure Your Credentials

- Use strong passwords with mixed case, numbers, and special characters
- Example: `RWA@2026#Secure$Pass99`
- Never share credentials in chat, logs, or version control

### 3. Monitor Credential Changes

Check the audit logs when credentials change:

```bash
# View recent activity logs
az containerapp logs show -n "$BACKEND_APP" -g "$RG" --tail 100
```

Look for lines like:
```
F [auth] Seeded default user 'mynewusername'
```

---

## Troubleshooting

### Problem: Login still fails with old password

**Cause:** The new revision hasn't fully started yet

**Solution:**
```bash
# Wait 2-3 minutes and try again
# Check revision status
az containerapp revision list -n "$BACKEND_APP" -g "$RG" -o table

# If still old revision, manually activate new one
LATEST_REV=$(az containerapp revision list -n "$BACKEND_APP" -g "$RG" \
  --query "sort_by([], &properties.createdTime)[-1].name" -o tsv)

az containerapp ingress traffic set -n "$BACKEND_APP" -g "$RG" \
  --traffic-weight "$LATEST_REV"=100
```

### Problem: New revision shows "Unhealthy"

**Cause:** Container failed to start (usually a dependency or configuration issue)

**Solution:**
```bash
# Check logs for the failed revision
LATEST_REV=$(az containerapp revision list -n "$BACKEND_APP" -g "$RG" \
  --query "sort_by([], &properties.createdTime)[-1].name" -o tsv)

az containerapp logs show -n "$BACKEND_APP" -g "$RG" --revision "$LATEST_REV" --tail 200
```

Look for error messages starting with `F` (fatal errors)

### Problem: Revision is healthy but login returns 401

**Cause:** Database might still have old user; env vars don't override existing users

**Solution:** The database needs to be cleared (this deletes all data):

```bash
# Delete the database file (if it's persisted in Azure Files)
# Option 1: Restart the container which recreates the database
az containerapp revision restart -n "$BACKEND_APP" -g "$RG"

# Option 2: Use Azure Storage Explorer to delete /data/rwa_data.db file
```

---

## Complete Example: Change Username AND Password

Here's a full walkthrough of changing credentials from scratch:

```bash
# 1. Set variables
SUB="95d9bb5b-4111-407d-9ef1-a0ada1962b0b"
RG="rg-rwa-dev-westus2"
BACKEND_APP="rwa-backend-dev"
NEW_USERNAME="admin-prod-2026"
NEW_PASSWORD="SuperSecure#Pass$2026"

# 2. Update credentials
az containerapp update -n "$BACKEND_APP" -g "$RG" \
  --set-env-vars \
    ADMIN_USERNAME="$NEW_USERNAME" \
    ADMIN_PASSWORD="$NEW_PASSWORD"

# 3. Wait for new revision (usually 30-60 seconds)
echo "Waiting for new revision to become active..."
sleep 10

# 4. Check status
az containerapp revision list -n "$BACKEND_APP" -g "$RG" -o table

# 5. Test login
echo "Testing login with new credentials..."
curl -s -X POST https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$NEW_USERNAME\",\"password\":\"$NEW_PASSWORD\"}"

# 6. If login succeeds, you'll get a token response
# If login fails (401), wait a few more seconds and retry
```

---

## Session Execution Summary

**Date:** March 27, 2026
**Original Credentials:** username=`admin`, password=`admin123`
**Updated Credentials:** username=`rwa-user12345`, password=`<admin-password>`

### Commands Run

```bash
# 1. Update environment variables
az containerapp update -n rwa-backend-dev -g rg-rwa-dev-westus2 \
  --set-env-vars \
    ADMIN_USERNAME="rwa-user12345" \
    ADMIN_PASSWORD="<admin-password>"
# Result: Created new revision rwa-backend-dev--0000009

# 2. Verify new revision status
az containerapp revision list -n rwa-backend-dev -g rg-rwa-dev-westus2 -o table
# Result: rwa-backend-dev--0000009 - Healthy, 100% traffic

# 3. Test login with new credentials
curl -X POST https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"rwa-user12345","password":"<admin-password>"}'
# Result: ✅ Received token - Login successful!
```

**Status:** ✅ Credentials changed successfully

---

## Next Steps

1. **Document your new credentials securely** (not in git, use Key Vault)
2. **Test the login** in the frontend application
3. **Consider adding persistent storage** to prevent data loss on restart
4. **Set up monitoring** for authentication events

---

## References

- **Backend Database Code:** `backend/database.py` (lines 856-868)
- **Backend Auth Routes:** `backend/main.py` (lines 47-48)
- **Azure Container Apps Docs:** https://learn.microsoft.com/en-us/azure/container-apps/
- **Environment Variable Updates:** https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets

