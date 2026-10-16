import { RESOURCE_DATA_URL } from './resource-data-source';
import { referenceData } from './reference-data';
export const loadResourceData = referenceData(RESOURCE_DATA_URL, (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid resource data');
  const data = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['htabRes', 'htabLib', 'htabLbr', 'htabAuth']) {
    if (typeof data[key] !== 'string') throw new Error('Invalid resource tab');
    result[key] = data[key];
  }
  return result;
});
