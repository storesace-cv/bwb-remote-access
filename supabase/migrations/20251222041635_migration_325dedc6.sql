-- Step 15 (COMPLETE): Drop and recreate backfill function with proper naming
DROP FUNCTION IF EXISTS migrate_notes_to_groups();

CREATE OR REPLACE FUNCTION migrate_notes_to_groups()
RETURNS TABLE(devices_migrated INTEGER, groups_created INTEGER) AS $$
DECLARE
  dev_rec RECORD;
  grp_name TEXT;
  subgrp_name TEXT;
  parent_grp_id UUID;
  sub_grp_id UUID;
  devices_count INTEGER := 0;
  groups_count INTEGER := 0;
  parts TEXT[];
BEGIN
  FOR dev_rec IN 
    SELECT d.id, d.owner, d.agent_id, d.notes 
    FROM android_devices d
    WHERE d.notes IS NOT NULL 
      AND d.notes != '' 
      AND d.group_id IS NULL
  LOOP
    parts := string_to_array(dev_rec.notes, '|');
    
    IF array_length(parts, 1) >= 1 THEN
      grp_name := trim(parts[1]);
      
      -- Get or create root group
      SELECT g.id INTO parent_grp_id
      FROM mesh_groups g
      WHERE g.agent_id = dev_rec.agent_id
        AND g.parent_group_id IS NULL
        AND g.name = grp_name
        AND g.deleted_at IS NULL
      LIMIT 1;
      
      IF parent_grp_id IS NULL THEN
        INSERT INTO mesh_groups (agent_id, owner_user_id, name, parent_group_id, level)
        VALUES (dev_rec.agent_id, dev_rec.owner, grp_name, NULL, 0)
        RETURNING id INTO parent_grp_id;
        groups_count := groups_count + 1;
      END IF;
      
      -- Handle subgroup if present
      IF array_length(parts, 1) >= 2 THEN
        subgrp_name := trim(parts[2]);
        
        IF subgrp_name != '' THEN
          -- Get or create subgroup
          SELECT g.id INTO sub_grp_id
          FROM mesh_groups g
          WHERE g.agent_id = dev_rec.agent_id
            AND g.parent_group_id = parent_grp_id
            AND g.name = subgrp_name
            AND g.deleted_at IS NULL
          LIMIT 1;
          
          IF sub_grp_id IS NULL THEN
            INSERT INTO mesh_groups (agent_id, owner_user_id, name, parent_group_id, level)
            VALUES (dev_rec.agent_id, dev_rec.owner, subgrp_name, parent_grp_id, 1)
            RETURNING id INTO sub_grp_id;
            groups_count := groups_count + 1;
          END IF;
          
          UPDATE android_devices 
          SET group_id = sub_grp_id 
          WHERE id = dev_rec.id;
          devices_count := devices_count + 1;
        ELSE
          UPDATE android_devices 
          SET group_id = parent_grp_id 
          WHERE id = dev_rec.id;
          devices_count := devices_count + 1;
        END IF;
      ELSE
        UPDATE android_devices 
        SET group_id = parent_grp_id 
        WHERE id = dev_rec.id;
        devices_count := devices_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT devices_count, groups_count;
END;
$$ LANGUAGE plpgsql;