-- Step 9: Attach trigger to mesh_groups
CREATE TRIGGER update_group_metadata_trigger
BEFORE INSERT OR UPDATE ON mesh_groups
FOR EACH ROW
EXECUTE FUNCTION update_group_path_and_level();