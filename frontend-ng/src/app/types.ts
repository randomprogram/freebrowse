import { DRAG_MODE } from '@niivue/niivue';

export type ViewMode = 'axial' | 'coronal' | 'sagittal' | 'ACS' | 'ACSR' | 'render';
export type DragMode = keyof typeof DRAG_MODE;

export interface ImageDetails {
  id: string;
  name: string;
  visible: boolean;
  colormap: string;
  opacity: number;
  contrastMin: number;
  contrastMax: number;
}

export interface FileItem {
  filename: string;
  url: string;
}

export interface DirectoryItem {
  name: string;
  path: string;
}

export interface DirectoryListingResponse {
  currentPath?: string;
  directories?: DirectoryItem[];
  files?: FileItem[];
}

export interface ViewerOptions {
  viewMode: ViewMode;
  crosshairWidth: number;
  crosshairVisible: boolean;
  crosshairColor: [number, number, number, number];
  interpolateVoxels: boolean;
  dragMode: DragMode;
  overlayOutlineWidth: number;
}

export interface VoxelLocation {
  name: string;
  voxel: [number, number, number];
  value: number;
}

export interface LocationData {
  mm: [number, number, number];
  voxels: VoxelLocation[];
}

export interface Frame4DState {
  totalFrames: number;
  currentFrame: number;
}

export interface DrawingOptions {
  enabled: boolean;
  mode: 'none' | 'pen' | 'wand';
  penValue: number;
  penFill: boolean;
  penErases: boolean;
  opacity: number;
  magicWand2dOnly: boolean;
  magicWandMaxDistanceMM: number;
  magicWandThresholdPercent: number;
  filename: string;
}

export interface SaveDocumentState {
  enabled: boolean;
  location: string;
}

export interface SaveVolumeState {
  enabled: boolean;
  isExternal: boolean;
  url: string;
}

export interface SaveState {
  isDownloadMode: boolean;
  document: SaveDocumentState;
  volumes: SaveVolumeState[];
}
