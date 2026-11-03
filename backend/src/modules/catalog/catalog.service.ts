import type { PositionDto } from '../auth/auth.types.js';
import { listAllLocalities, listAllPositions } from '../users/users.repository.js';

export interface CatalogDto {
  positions: PositionDto[];
  localities: { name: string }[];
}

export async function getCatalog(): Promise<CatalogDto> {
  const [positions, localities] = await Promise.all([
    listAllPositions(),
    listAllLocalities(),
  ]);
  return { positions, localities };
}
