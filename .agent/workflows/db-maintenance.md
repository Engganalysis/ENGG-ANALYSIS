---
description: Safe Database Maintenance and Cleanup
---

# Safe Database Maintenance Rule

**MANDATORY RULE:** Before performing ANY destructive action in TiDB (DELETE, TRUNCATE, DROP, or grouping/normalization scripts), you MUST create a backup of the current data.

### Procedure:
1. **Always Create a Backup First**
   Run the backup utility to create a timestamped copy of the data:
   ```powershell
   node server/backup_engg_result.js
   ```

2. **Verify Backup**
   Ensure the backup table was created and contains the expected number of rows before proceeding.

3. **Check Logic on Sample Data**
   If performing grouping or cleanup, test the SQL/Logic on a small subset or a temporary table before applying it to the main `ENGG_RESULT` table.

4. **Document Changes**
   Log why the cleanup was performed and keep the name of the backup table in the conversation notes for at least 24 hours.

// turbo
### Standard Backup Command
node server/backup_engg_result.js
