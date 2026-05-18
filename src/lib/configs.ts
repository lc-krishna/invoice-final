import communitiesJson from "@/config/communities.json";
import driveFoldersJson from "@/config/drive_folders.json";
import rmVendorsJson from "@/config/rm_vendors.json";
import rmBanksJson from "@/config/rm_banks.json";
import glAccountsJson from "@/config/gl_accounts.json";
import rmUnitsJson from "@/config/rm_all_units.json";
import type { Community, DriveFolder, RMVendor, RMBank, GLAccount, RMUnit } from "./types";

export const COMMUNITIES: Community[] = (communitiesJson as { communities: Community[] }).communities;
export const DRIVE_FOLDERS: DriveFolder[] = (driveFoldersJson as { folders: DriveFolder[] }).folders;
export const RM_VENDORS: RMVendor[] = (rmVendorsJson as { vendors: RMVendor[] }).vendors;
export const RM_BANKS: RMBank[] = (rmBanksJson as { banks: RMBank[] }).banks;
export const GL_ACCOUNTS: GLAccount[] = (glAccountsJson as { glAccounts: GLAccount[] }).glAccounts;

// Build a propertyId → units map at module load time for O(1) lookup
const _unitsByProperty = new Map<number, RMUnit[]>();
for (const prop of (rmUnitsJson as { properties: { propertyId: number; units: RMUnit[] }[] }).properties) {
  _unitsByProperty.set(prop.propertyId, prop.units);
}

export function getUnitsForProperty(propertyId: number): RMUnit[] {
  return _unitsByProperty.get(propertyId) ?? [];
}

export function getCommunityByLabel(label: string): Community | undefined {
  return COMMUNITIES.find((c) => c.label.toLowerCase() === label.toLowerCase());
}
