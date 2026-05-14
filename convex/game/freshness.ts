export type Revisioned = {
  revision: number;
};

export const shouldAcceptRevision = (
  existing: Revisioned | null,
  revision: number
) => !existing || revision >= existing.revision;
