import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupDevices, type GroupedDevice, type GroupingResult } from "../src/lib/grouping";

function makeDevice(
  id: string,
  deviceId: string,
  friendlyName: string,
  groupName: string | null,
  subgroupName: string | null,
): GroupedDevice {
  return {
    id,
    device_id: deviceId,
    friendly_name: friendlyName,
    group_name: groupName,
    subgroup_name: subgroupName,
    notes: null,
    last_seen_at: null,
    rustdesk_password: null,
    owner_email: null,
    owner: null,
    mesh_username: null,
    group_id: null,
    subgroup_id: null,
    created_at: null,
    updated_at: null,
    from_provisioning_code: null,
  };
}

describe("groupDevices sorting", () => {
  it("orders groups, subgroups and devices alphabetically", () => {
    const devices: GroupedDevice[] = [
      // Grupo Pessoal, subgrupo Casa, dois devices fora de ordem
      makeDevice("1", "dev-1", "VM Cozinha 1", "Pessoal", "Casa"),
      makeDevice("2", "dev-2", "Android Box", "Pessoal", "Casa"),
      // Mesmo grupo, subgrupo Testes
      makeDevice("3", "dev-3", "One Plus", "Pessoal", "Testes"),
      // Outro grupo para testar ordenação de grupos
      makeDevice("4", "dev-4", "Servidor", "Backend", null),
    ];

    const result: GroupingResult = groupDevices(devices);

    const groupNames = result.groups.map((g) => g.name);
    assert.deepEqual(groupNames, ["Backend", "Pessoal"]);

    const pessoal = result.groups.find((g) => g.name === "Pessoal");
    assert.ok(pessoal);
    const subgroupNames = pessoal!.subgroups.map((s) => s.name);
    assert.deepEqual(subgroupNames, ["Casa", "Testes"]);

    const casaSubgroup = pessoal!.subgroups.find((s) => s.name === "Casa");
    assert.ok(casaSubgroup);
    const deviceNamesInCasa = casaSubgroup!.devices.map((d) => d.friendly_name);
    assert.deepEqual(deviceNamesInCasa, ["Android Box", "VM Cozinha 1"]);
  });
});