export type SeedanceImageRole =
  | "reference_image"
  | "first_frame"
  | "last_frame";

export type ReferenceImage = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    /** Seedance 参考图角色：参考图 / 首帧 / 尾帧 */
    role?: SeedanceImageRole;
};
