import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DRAG_MODE, DocumentData, Niivue, NVDocument, NVImage, cmapper } from '@niivue/niivue';
import { FileListComponent } from '../file-list/file-list.component';
import { ImageCanvasComponent, sliceTypeMap } from '../image-canvas/image-canvas.component';
import { ImageUploaderComponent } from '../image-uploader/image-uploader.component';
import { DragModeSelectorComponent } from '../drag-mode-selector/drag-mode-selector.component';
import { ViewSelectorComponent } from '../view-selector/view-selector.component';
import { LabeledSliderWithInputComponent } from '../labeled-slider-with-input/labeled-slider-with-input.component';
import {
  DragMode,
  DrawingOptions,
  FileItem,
  Frame4DState,
  ImageDetails,
  LocationData,
  SaveState,
  ViewerOptions,
  ViewMode,
} from '../../types';

@Component({
  selector: 'app-freebrowse',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ImageUploaderComponent,
    ImageCanvasComponent,
    ViewSelectorComponent,
    DragModeSelectorComponent,
    FileListComponent,
    LabeledSliderWithInputComponent,
  ],
  templateUrl: './freebrowse.component.html',
  styleUrls: ['./freebrowse.component.scss'],
})
export class FreebrowseComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('filePicker', { static: false }) filePicker?: ElementRef<HTMLInputElement>;

  readonly nv = new Niivue({
    loadingText: 'Drag-drop images',
    dragAndDropEnabled: true,
    textHeight: 0.02,
    backColor: [0, 0, 0, 1],
    crosshairColor: [1.0, 0.0, 0.0, 0.5],
    multiplanarForceRender: false,
  });

  images: ImageDetails[] = [];
  showUploader = true;
  loadViaNvd = true;
  currentImageIndex: number | null = null;
  sidebarOpen = true;
  activeTab: 'nvds' | 'data' | 'sceneDetails' | 'drawing' = 'nvds';
  footerOpen = true;
  serverlessMode = false;
  logoutUrl: string | null = null;
  configLoaded = false;
  removeDialogOpen = false;
  volumeToRemove: number | null = null;
  skipRemoveConfirmation = false;
  saveDialogOpen = false;
  settingsDialogOpen = false;
  locationData: LocationData | null = null;
  frame4DState: Frame4DState = { totalFrames: 1, currentFrame: 0 };

  viewerOptions: ViewerOptions = {
    viewMode: 'ACS',
    crosshairWidth: 1,
    crosshairVisible: true,
    crosshairColor: [1.0, 0.0, 0.0, 0.5],
    interpolateVoxels: false,
    dragMode: 'contrast',
    overlayOutlineWidth: 0,
  };

  drawingOptions: DrawingOptions = {
    enabled: false,
    mode: 'none',
    penValue: 1,
    penFill: true,
    penErases: false,
    opacity: 1,
    magicWand2dOnly: true,
    magicWandMaxDistanceMM: 15,
    magicWandThresholdPercent: this.nv.opts.clickToSegmentPercent || 0.05,
    filename: 'drawing.nii.gz',
  };

  saveState: SaveState = {
    isDownloadMode: false,
    document: {
      enabled: false,
      location: '',
    },
    volumes: [],
  };

  readonly colormaps = Object.keys(cmapper.colormaps || {});
  readonly dragModeOptions = (Object.keys(DRAG_MODE).filter((key) => isNaN(Number(key))) as DragMode[]);

  private glUpdateHandle?: ReturnType<typeof setTimeout>;

  get crosshairColorHex(): string {
    const [r, g, b] = this.viewerOptions.crosshairColor;
    const toHex = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  get isSaveActionDisabled(): boolean {
    return !this.saveState.document.enabled && !this.saveState.volumes.some((v) => v.enabled);
  }

  constructor(private cdr: ChangeDetectorRef, private zone: NgZone) {}

  ngOnInit(): void {
    this.fetchConfig();
    this.loadNvdFromUrl();
  }

  ngAfterViewInit(): void {
    this.setupNiivueCallbacks();
    this.applyViewerOptions();
  }

  ngOnDestroy(): void {
    if (this.glUpdateHandle) {
      clearTimeout(this.glUpdateHandle);
    }
  }

  // region lifecycle helpers
  private setupNiivueCallbacks(): void {
    this.nv.onDragRelease = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      this.zone.run(() => {
        this.updateImageDetails();
        this.cdr.markForCheck();
      });
    };

    this.nv.onLocationChange = (location) => {
      this.zone.run(() => {
        this.handleLocationChange(location);
        this.cdr.markForCheck();
      });
    };

    this.nv.onOptsChange = () => {
      this.zone.run(() => {
        this.syncDrawingOptionsFromNiivue();
        this.cdr.markForCheck();
      });
    };
  }

  private async fetchConfig(): Promise<void> {
    try {
      const response = await fetch('/config');
      if (response.ok) {
        const config = await response.json();
        this.serverlessMode = !!config.serverless;
        this.logoutUrl = config.logout_url || null;
        if (this.serverlessMode) {
          this.activeTab = 'sceneDetails';
        }
      }
    } catch (error) {
      console.error('Failed to load config', error);
    } finally {
      this.configLoaded = true;
      this.cdr.markForCheck();
    }
  }

  private loadNvdFromUrl(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const nvdParam = params.get('nvd');
    if (!nvdParam) {
      return;
    }
    const file: FileItem = {
      filename: nvdParam.split('/').pop() || nvdParam,
      url: nvdParam,
    };
    this.handleNvdFileSelect(file);
  }
  // endregion

  // region frame state helpers
  private applyFrame4D(frameIndex: number): void {
    const nVolumes = this.nv.volumes.length;
    for (let i = 0; i < nVolumes; i++) {
      this.nv.setFrame4D(this.nv.volumes[i].id, frameIndex);
    }
    // const setter = (this.nv as any)?.setFrame4D;
    // if (typeof setter === 'function') {
    //   setter.call(this.nv, frameIndex);
    //   return;
    // }
    if (this.nv.scene) {
      (this.nv.scene as any).frame4D = frameIndex;
    }
    if (typeof this.nv.updateGLVolume === 'function') {
      this.nv.updateGLVolume();
    }
  }

  private resolveFrameCount(volume: any): number {
    if (!volume) {
      return 1;
    }
    const direct = Number(volume?.nFrame4D);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.floor(direct);
    }
    const dims = volume?.hdr?.dims;
    if (Array.isArray(dims) && dims.length > 4) {
      const dim = Number(dims[4]);
      if (Number.isFinite(dim) && dim > 0) {
        return Math.floor(dim);
      }
    }
    return 1;
  }

  private syncFrame4DState(): void {
    const maxFrames = this.nv.volumes.reduce((max, volume) => {
      return Math.max(max, this.resolveFrameCount(volume));
    }, 1);

    if (maxFrames <= 1) {
      if (this.frame4DState.totalFrames !== 1 || this.frame4DState.currentFrame !== 0) {
        this.frame4DState = { totalFrames: 1, currentFrame: 0 };
      }
      return;
    }

    const maxIndex = Math.max(0, maxFrames - 1);
    const sceneFrame = (this.nv.scene as any)?.frame4D;
    const candidate = typeof sceneFrame === 'number' && !isNaN(sceneFrame)
      ? sceneFrame
      : this.frame4DState.currentFrame;
    const clamped = Math.min(Math.max(Math.round(candidate || 0), 0), maxIndex);

    this.applyFrame4D(clamped);
    this.frame4DState = { totalFrames: maxFrames, currentFrame: clamped };
  }

  handleFrame4DChange(value: number): void {
    if (this.frame4DState.totalFrames <= 1) {
      return;
    }
    const maxIndex = Math.max(0, this.frame4DState.totalFrames - 1);
    const clamped = Math.min(Math.max(Math.round(value), 0), maxIndex);
    if (clamped !== this.frame4DState.currentFrame) {
      this.applyFrame4D(clamped);
      this.frame4DState = { ...this.frame4DState, currentFrame: clamped };
    }
  }
  // endregion

  private scheduleGLUpdate(): void {
    if (this.glUpdateHandle) {
      clearTimeout(this.glUpdateHandle);
    }
    this.glUpdateHandle = setTimeout(() => {
      this.nv.updateGLVolume();
    }, 100);
  }

  private handleLocationChange(locationObject: any): void {
    if (locationObject && this.nv.volumes.length > 0) {
      const voxels = this.nv.volumes.map((volume, index) => {
        const voxel = volume.mm2vox(locationObject.mm);
        const i = Math.round(voxel[0]);
        const j = Math.round(voxel[1]);
        const k = Math.round(voxel[2]);
        const value = volume.getValue(i, j, k);
        return {
          name: volume.name || `Volume ${index + 1}`,
          voxel: [i, j, k] as [number, number, number],
          value,
        };
      });
      this.locationData = {
        mm: locationObject.mm,
        voxels,
      };
    }
  }

  private applyViewerOptions(): void {
    const config = sliceTypeMap[this.viewerOptions.viewMode];
    this.nv.opts.crosshairWidth = this.viewerOptions.crosshairVisible ? this.viewerOptions.crosshairWidth : 0;
    this.nv.setCrosshairColor(this.viewerOptions.crosshairColor);
    this.nv.setInterpolation(!this.viewerOptions.interpolateVoxels);
    this.nv.opts.dragMode = DRAG_MODE[this.viewerOptions.dragMode];
    this.nv.overlayOutlineWidth = this.viewerOptions.overlayOutlineWidth;

    if (config) {
      this.nv.opts.multiplanarShowRender = config.showRender;
      this.nv.setSliceType(config.sliceType);
    } else {
      this.nv.setSliceType(0);
    }
  }

  private syncViewerOptionsFromNiivue(): void {
    let viewMode: ViewMode = 'ACS';
    for (const [mode, cfg] of Object.entries(sliceTypeMap)) {
      if (cfg.sliceType === this.nv.opts.sliceType) {
        viewMode = mode as ViewMode;
        break;
      }
    }

    let dragMode: DragMode = 'contrast';
    for (const [mode, value] of Object.entries(DRAG_MODE)) {
      if (value === this.nv.opts.dragMode) {
        dragMode = mode as DragMode;
        break;
      }
    }

    this.viewerOptions = {
      viewMode,
      crosshairWidth: this.nv.opts.crosshairWidth,
      crosshairVisible: this.nv.opts.crosshairWidth > 0,
      crosshairColor: this.nv.opts.crosshairColor
        ? ([...this.nv.opts.crosshairColor] as [number, number, number, number])
        : [1.0, 0.0, 0.0, 0.5],
      interpolateVoxels: !this.nv.opts.isNearestInterpolation,
      dragMode,
      overlayOutlineWidth: this.nv.overlayOutlineWidth,
    };
  }

  private syncDrawingOptionsFromNiivue(): void {
    if (this.drawingOptions.mode !== 'wand') {
      return;
    }
    const threshold = this.nv.opts.clickToSegmentPercent;
    const distance = this.nv.opts.clickToSegmentMaxDistanceMM;
    if (
      threshold !== this.drawingOptions.magicWandThresholdPercent ||
      distance !== this.drawingOptions.magicWandMaxDistanceMM
    ) {
      this.drawingOptions = {
        ...this.drawingOptions,
        magicWandThresholdPercent: threshold,
        magicWandMaxDistanceMM: distance,
      };
    }
  }

  async handleFileUpload(files: File[]): Promise<void> {
    try {
      if (this.showUploader) {
        this.showUploader = false;
      }

      let retries = 0;
      while (!this.nv.canvas && retries < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }
      if (!this.nv.canvas) {
        throw new Error('Canvas failed to initialize');
      }

      const nvdFiles = files.filter((file) => file.name.toLowerCase().endsWith('.nvd') || file.name.toLowerCase().endsWith('.json'));
      if (nvdFiles.length > 0) {
        try {
          const text = await nvdFiles[0].text();
          const jsonData = JSON.parse(text);
          await this.loadNvdData(jsonData);
          this.zone.run(() => this.cdr.markForCheck());
          return;
        } catch (error) {
          console.error('Failed to load uploaded NVD file', error);
        }
      }

      await Promise.all(
        files.map(async (file) => {
          const nvimage = await NVImage.loadFromFile({ file });
          this.nv.addVolume(nvimage);
        }),
      );

      this.applyViewerOptions();
      this.updateImageDetails();
      if (this.currentImageIndex === null && files.length > 0) {
        this.currentImageIndex = 0;
      }
      this.zone.run(() => this.cdr.markForCheck());
    } catch (error) {
      console.error('Error handling file upload', error);
    }
  }

  async handleImagingFileSelect(file: FileItem): Promise<void> {
    try {
      if (this.showUploader) {
        this.showUploader = false;
      }

      let retries = 0;
      while (!this.nv.canvas && retries < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }
      if (!this.nv.canvas) {
        throw new Error('Canvas failed to initialize');
      }

      const basename = file.filename.split('/').pop() || file.filename;
      await this.nv.addVolumeFromUrl({ url: file.url, name: basename });
      this.applyViewerOptions();
      this.updateImageDetails();
      if (this.nv.volumes.length > 0) {
        this.currentImageIndex = this.nv.volumes.length - 1;
      }
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading imaging file', error);
    }
  }

  async handleNvdFileSelect(file: FileItem): Promise<void> {
    try {
      const response = await fetch(file.url);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const jsonData = await response.json();
      this.showUploader = false;

      let retries = 0;
      while (!this.nv.canvas && retries < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }
      if (!this.nv.canvas) {
        throw new Error('Canvas failed to initialize');
      }

      await this.loadNvdData(jsonData);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading NVD', error);
    }
  }

  private async loadNvdData(jsonData: any): Promise<void> {
    this.images = [];
    this.currentImageIndex = null;
    this.frame4DState = { totalFrames: 1, currentFrame: 0 };

    if (this.loadViaNvd) {
      const document = await NVDocument.loadFromJSON(jsonData);
      await document.fetchLinkedData();
      try {
        await this.nv.loadDocument(document);
        if (jsonData.encodedImageBlobs?.length) {
          for (let i = 0; i < jsonData.encodedImageBlobs.length; i++) {
            const blob = jsonData.encodedImageBlobs[i];
            if (!blob) continue;
            try {
              const imageOptions = jsonData.imageOptionsArray?.[i] || {};
              const nvimage = await NVImage.loadFromBase64({ base64: blob, ...imageOptions });
              this.nv.addVolume(nvimage);
            } catch (error) {
              console.error(`Failed to load encoded image blob ${i}`, error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load document', error);
      }
      this.syncViewerOptionsFromNiivue();
      this.applyViewerOptions();

      if (jsonData.imageOptionsArray && this.nv.volumes) {
        for (let i = 0; i < this.nv.volumes.length && i < jsonData.imageOptionsArray.length; i++) {
          const imageOption = jsonData.imageOptionsArray[i];
          if (imageOption?.url) {
            this.nv.volumes[i].url = imageOption.url;
          }
        }
      }
    } else {
      while (this.nv.volumes.length > 0) {
        this.nv.removeVolumeByIndex(0);
      }
      while (this.nv.meshes && this.nv.meshes.length > 0) {
        this.nv.removeMesh(this.nv.meshes[0]);
      }
      this.nv.drawBitmap = null;
      this.nv.setDrawingEnabled(false);

      if ((jsonData as any).imageOptionsArray?.length) {
        await this.nv.loadVolumes((jsonData as any).imageOptionsArray);
      }

      if ((jsonData as any).meshOptionsArray?.length) {
        await this.nv.loadMeshes((jsonData as any).meshOptionsArray);
      }

      this.nv.setDefaults();
      if ((jsonData as any).opts) {
        this.nv.setDefaults((jsonData as any).opts);
      }
      this.syncViewerOptionsFromNiivue();
      this.applyViewerOptions();
    }

    this.currentImageIndex = this.nv.volumes.length > 0 ? 0 : null;
    this.updateImageDetails();
    this.nv.setCrosshairColor([0, 1, 0, 0.1]);
  }

  private updateImageDetails(): void {
    const loadedImages = this.nv.volumes.map((vol, index) => ({
      id: vol.id,
      name: vol.name || `Volume ${index + 1}`,
      visible: vol.opacity > 0,
      colormap: vol.colormap,
      opacity: vol.opacity,
      contrastMin: vol.cal_min ?? 0,
      contrastMax: vol.cal_max ?? 100,
    }));
    this.images = loadedImages;
    console.log('Updated images:', this.images);
    this.syncFrame4DState();

    if (this.nv.scene && this.nv.scene.crosshairPos) {
      this.handleLocationChange({ mm: this.nv.scene.crosshairPos });
    }
  }

  toggleImageVisibility(id: string): void {
    this.images = this.images.map((img) => {
      if (img.id === id) {
        const newVisible = !img.visible;
        const newOpacity = img.opacity === 0 ? 1 : img.opacity;
        const volumeIndex = this.nv.getVolumeIndexByID(id);
        if (volumeIndex >= 0) {
          this.nv.setOpacity(volumeIndex, newVisible ? newOpacity : 0);
        }
        return { ...img, visible: newVisible };
      }
      return img;
    });
    this.nv.updateGLVolume();
  }

  handleViewMode(mode: ViewMode): void {
    this.viewerOptions = { ...this.viewerOptions, viewMode: mode };
    this.applyViewerOptions();
  }

  handleOpacityChange(value: number): void {
    if (this.currentImageIndex === null || !this.images[this.currentImageIndex]) {
      return;
    }
    const imageId = this.images[this.currentImageIndex].id;
    const volumeIndex = this.nv.getVolumeIndexByID(imageId);
    if (volumeIndex >= 0) {
      this.nv.setOpacity(volumeIndex, value);
      this.scheduleGLUpdate();
      this.images = this.images.map((img, index) =>
        index === this.currentImageIndex ? { ...img, opacity: value } : img,
      );
    }
  }

  handleContrastMinChange(value: number): void {
    if (this.currentImageIndex === null || !this.images[this.currentImageIndex]) {
      return;
    }
    const imageId = this.images[this.currentImageIndex].id;
    const volumeIndex = this.nv.getVolumeIndexByID(imageId);
    if (volumeIndex >= 0) {
      const volume = this.nv.volumes[volumeIndex];
      volume.cal_min = value;
      this.scheduleGLUpdate();
      this.images = this.images.map((img, index) =>
        index === this.currentImageIndex ? { ...img, contrastMin: value } : img,
      );
    }
  }

  handleContrastMaxChange(value: number): void {
    if (this.currentImageIndex === null || !this.images[this.currentImageIndex]) {
      return;
    }
    const imageId = this.images[this.currentImageIndex].id;
    const volumeIndex = this.nv.getVolumeIndexByID(imageId);
    if (volumeIndex >= 0) {
      const volume = this.nv.volumes[volumeIndex];
      volume.cal_max = value;
      this.scheduleGLUpdate();
      this.images = this.images.map((img, index) =>
        index === this.currentImageIndex ? { ...img, contrastMax: value } : img,
      );
    }
  }

  handleColormapChange(value: string): void {
    if (this.currentImageIndex === null || !this.images[this.currentImageIndex]) {
      return;
    }
    const imageId = this.images[this.currentImageIndex].id;
    const volumeIndex = this.nv.getVolumeIndexByID(imageId);
    if (volumeIndex >= 0) {
      const volume = this.nv.volumes[volumeIndex];
      if (volume.colormap === value) {
        return;
      }
      volume.colormap = value;
      this.images = this.images.map((img, index) =>
        index === this.currentImageIndex ? { ...img, colormap: value } : img,
      );
      this.scheduleGLUpdate();
    }
  }

  handleAddMoreFiles(): void {
    this.filePicker?.nativeElement.click();
  }

  onAdditionalFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleFileUpload(Array.from(input.files));
      input.value = '';
    }
  }

  handleSaveScene(download = false): void {
    this.saveState = {
      isDownloadMode: download,
      document: {
        enabled: false,
        location: '',
      },
      volumes: this.nv.volumes.map((volume) => ({
        enabled: false,
        isExternal: !!(volume.url && volume.url.startsWith('http')),
        url: volume.url || '',
      })),
    };
    this.saveDialogOpen = true;
  }

  async handleConfirmSave(): Promise<void> {
    if (!this.saveState.document.enabled && !this.saveState.volumes.some((v) => v.enabled)) {
      this.handleCancelSave();
      return;
    }

    if (this.saveState.document.enabled && this.saveState.document.location.trim()) {
      try {
        const jsonData = this.nv.json() as DocumentData | undefined;
        if (!jsonData) {
          throw new Error('No document data available');
        }
        const finalJson = { ...jsonData };
        if (Array.isArray(finalJson.imageOptionsArray)) {
          finalJson.imageOptionsArray = finalJson.imageOptionsArray.map((option: any, index: number) => {
            const volumeState = this.saveState.volumes[index];
            if (volumeState?.enabled && volumeState.url.trim()) {
              return { ...option, url: volumeState.url };
            }
            return option;
          });
        }

        if (this.saveState.isDownloadMode) {
          const blob = new Blob([JSON.stringify(finalJson, null, 2)], { type: 'application/json' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = this.saveState.document.location || 'scene.nvd';
          link.click();
          URL.revokeObjectURL(link.href);
        } else {
          await fetch('/nvd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: this.saveState.document.location, data: finalJson }),
          });
        }
      } catch (error) {
        console.error('Failed to save document', error);
      }
    }

    await Promise.all(
      this.saveState.volumes.map(async (state, index) => {
        if (!state.enabled) {
          return;
        }
        const volume = this.nv.volumes[index];
        if (!volume) {
          return;
        }
        if (this.saveState.isDownloadMode) {
          try {
            const filename = state.url || `${volume.name || `volume-${index + 1}`}.nii.gz`;
            const uint8 = await volume.saveToUint8Array(filename);
            const blob = new Blob([uint8], { type: 'application/octet-stream' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
          } catch (error) {
            console.error(`Failed to download volume ${index}`, error);
          }
          return;
        }

        if (!state.url.trim()) {
          return;
        }
        try {
          const shouldCompress = state.url.toLowerCase().endsWith('.gz');
          const filename = shouldCompress ? state.url : `${state.url}.gz`;
          const uint8 = await volume.saveToUint8Array(filename);
          const base64 = this.uint8ArrayToBase64(uint8);
          await fetch('/nii', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: state.url, data: base64 }),
          });
        } catch (error) {
          console.error(`Failed to save volume ${index}`, error);
        }
      }),
    );

    this.handleCancelSave();
  }

  handleCancelSave(): void {
    this.saveDialogOpen = false;
    this.saveState = {
      isDownloadMode: false,
      document: { enabled: false, location: '' },
      volumes: [],
    };
  }

  handleVolumeUrlChange(index: number, url: string): void {
    this.saveState = {
      ...this.saveState,
      volumes: this.saveState.volumes.map((state, i) => (i === index ? { ...state, url } : state)),
    };
  }

  handleVolumeCheckboxChange(index: number, enabled: boolean): void {
    this.saveState = {
      ...this.saveState,
      volumes: this.saveState.volumes.map((state, i) => {
        if (i !== index) {
          return state;
        }
        if (enabled && state.isExternal) {
          return { ...state, enabled, url: '' };
        }
        return { ...state, enabled };
      }),
    };
  }

  handleDocumentLocationChange(location: string): void {
    this.saveState = {
      ...this.saveState,
      document: { ...this.saveState.document, location },
    };
  }

  handleDocumentCheckboxChange(enabled: boolean): void {
    this.saveState = {
      ...this.saveState,
      document: { ...this.saveState.document, enabled },
    };
  }

  removeVolume(imageIndex: number): void {
    const image = this.images[imageIndex];
    if (!image) {
      return;
    }
    const volumeIndex = this.nv.getVolumeIndexByID(image.id);
    if (volumeIndex >= 0) {
      this.nv.removeVolumeByIndex(volumeIndex);
      this.updateImageDetails();
      if (this.currentImageIndex === imageIndex) {
        if (imageIndex > 0) {
          this.currentImageIndex = imageIndex - 1;
        } else if (this.images.length > 1) {
          this.currentImageIndex = 0;
        } else {
          this.currentImageIndex = null;
        }
      } else if (this.currentImageIndex !== null && this.currentImageIndex > imageIndex) {
        this.currentImageIndex -= 1;
      }
    }
  }

  handleRemoveVolumeClick(imageIndex: number): void {
    if (this.skipRemoveConfirmation) {
      this.removeVolume(imageIndex);
      return;
    }
    this.volumeToRemove = imageIndex;
    this.removeDialogOpen = true;
  }

  handleConfirmRemove(): void {
    if (this.volumeToRemove === null) {
      return;
    }
    this.removeVolume(this.volumeToRemove);
    this.removeDialogOpen = false;
    this.volumeToRemove = null;
  }

  handleCancelRemove(): void {
    this.removeDialogOpen = false;
    this.volumeToRemove = null;
  }

  async handleEditVolume(imageIndex: number): Promise<void> {
    const image = this.images[imageIndex];
    if (!image) {
      return;
    }
    const volumeIndex = this.nv.getVolumeIndexByID(image.id);
    if (volumeIndex < 0) {
      return;
    }
    const volume = this.nv.volumes[volumeIndex];
    try {
      const volumeData = (await this.nv.saveImage({
        filename: '',
        isSaveDrawing: false,
        volumeByIndex: volumeIndex,
      })) as Uint8Array;
      const drawingImage = await this.nv.niftiArray2NVImage(volumeData);
      drawingImage.name = `${image.name}-drawing`;
      const loadSuccess = this.nv.loadDrawing(drawingImage);
      if (loadSuccess) {
        this.handleCreateDrawingLayer();
      }
    } catch (error) {
      console.error('Failed to edit volume', error);
    }
  }

  canEditVolume(imageIndex: number): boolean {
    const image = this.images[imageIndex];
    if (!image) {
      return false;
    }
    const volumeIndex = this.nv.getVolumeIndexByID(image.id);
    if (volumeIndex < 0) {
      return false;
    }
    const volume = this.nv.volumes[volumeIndex];
    const background = this.nv.back;
    if (!volume || !background || !volume.hdr || !background.hdr) {
      return false;
    }
    const volDims = volume.hdr.dims;
    const backDims = background.hdr.dims;
    if (!volDims || !backDims || volDims.length !== backDims.length) {
      return false;
    }
    for (let i = 0; i < volDims.length; i++) {
      if (volDims[i] !== backDims[i]) {
        return false;
      }
    }
    const volAffine = volume.hdr.affine;
    const backAffine = background.hdr.affine;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const idx = i * 4 + j;
        const volValue = Number(volAffine[idx]);
        const backValue = Number(backAffine[idx]);
        if (Math.abs(volValue - backValue) > 1e-3) {
          return false;
        }
      }
    }
    return true;
  }

  handleCrosshairWidthChange(value: number): void {
    this.viewerOptions = { ...this.viewerOptions, crosshairWidth: value };
    this.scheduleGLUpdate();
    this.applyViewerOptions();
  }

  handleInterpolateVoxelsChange(checked: boolean): void {
    this.viewerOptions = { ...this.viewerOptions, interpolateVoxels: checked };
    this.applyViewerOptions();
  }

  handleCrosshairVisibleChange(visible: boolean): void {
    this.viewerOptions = { ...this.viewerOptions, crosshairVisible: visible };
    this.applyViewerOptions();
  }

  handleCrosshairColorChange(color: string): void {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const a = this.viewerOptions.crosshairColor[3];
    this.viewerOptions = { ...this.viewerOptions, crosshairColor: [r, g, b, a] };
    this.applyViewerOptions();
  }

  handleOverlayOutlineWidthChange(value: number): void {
    this.viewerOptions = { ...this.viewerOptions, overlayOutlineWidth: value };
    this.nv.overlayOutlineWidth = value;
    this.scheduleGLUpdate();
  }

  handleDragModeChange(mode: DragMode): void {
    this.viewerOptions = { ...this.viewerOptions, dragMode: mode };
    this.applyViewerOptions();
  }

  handleCreateDrawingLayer(): void {
    this.nv.setDrawingEnabled(false);
    const penValue = this.drawingOptions.penErases ? 0 : this.drawingOptions.penValue;
    this.nv.setPenValue(penValue, this.drawingOptions.penFill);
    this.nv.setDrawOpacity(this.drawingOptions.opacity);
    this.drawingOptions = { ...this.drawingOptions, enabled: true, mode: 'none' };
    this.activeTab = 'drawing';
  }

  handleDrawModeChange(mode: DrawingOptions['mode'] | string): void {
    const nextMode: DrawingOptions['mode'] = mode === 'pen' || mode === 'wand' ? mode : 'none';
    const penErases = nextMode === 'wand' ? false : this.drawingOptions.penErases;
    this.drawingOptions = {
      ...this.drawingOptions,
      mode: nextMode,
      penErases,
    };
    if (nextMode === 'pen') {
      const penValue = penErases ? 0 : this.drawingOptions.penValue;
      this.nv.setPenValue(penValue, this.drawingOptions.penFill);
      this.nv.setDrawingEnabled(true);
      this.nv.opts.clickToSegment = false;
    } else if (nextMode === 'wand') {
      this.nv.setDrawingEnabled(true);
      this.nv.opts.clickToSegment = true;
      this.nv.opts.clickToSegmentIs2D = this.drawingOptions.magicWand2dOnly;
      this.nv.opts.clickToSegmentAutoIntensity = true;
      this.nv.opts.clickToSegmentMaxDistanceMM = this.drawingOptions.magicWandMaxDistanceMM;
      this.nv.opts.clickToSegmentPercent = this.drawingOptions.magicWandThresholdPercent;
      const penValue = this.drawingOptions.penValue;
      this.nv.setPenValue(penValue, false);
    } else {
      this.nv.setDrawingEnabled(false);
      this.nv.opts.clickToSegment = false;
    }
  }

  handlePenFillChange(checked: boolean): void {
    this.drawingOptions = { ...this.drawingOptions, penFill: checked };
    this.nv.drawFillOverwrites = checked;
    if (this.drawingOptions.mode === 'pen') {
      const penValue = this.drawingOptions.penErases ? 0 : this.drawingOptions.penValue;
      this.nv.setPenValue(penValue, checked);
    }
  }

  handlePenErasesChange(checked: boolean): void {
    this.drawingOptions = { ...this.drawingOptions, penErases: checked };
    if (this.drawingOptions.mode === 'pen') {
      const penValue = checked ? 0 : this.drawingOptions.penValue;
      this.nv.setPenValue(penValue, this.drawingOptions.penFill);
    } else if (this.drawingOptions.mode === 'none') {
      this.nv.setDrawingEnabled(false);
    }
  }

  handlePenValueChange(value: number): void {
    this.drawingOptions = { ...this.drawingOptions, penValue: value };
    if (this.drawingOptions.mode === 'pen' && !this.drawingOptions.penErases) {
      this.nv.setPenValue(value, this.drawingOptions.penFill);
    }
  }

  handleDrawingFilenameChange(filename: string): void {
    this.drawingOptions = { ...this.drawingOptions, filename };
  }

  handleDrawingOpacityChange(opacity: number): void {
    this.drawingOptions = { ...this.drawingOptions, opacity };
    this.nv.setDrawOpacity(opacity);
    this.scheduleGLUpdate();
  }

  handleMagicWand2dOnlyChange(checked: boolean): void {
    this.drawingOptions = { ...this.drawingOptions, magicWand2dOnly: checked };
    if (this.drawingOptions.mode === 'wand') {
      this.nv.opts.clickToSegmentIs2D = checked;
    }
  }

  handleMagicWandMaxDistanceChange(value: number): void {
    this.drawingOptions = { ...this.drawingOptions, magicWandMaxDistanceMM: value };
    if (this.drawingOptions.mode === 'wand') {
      this.nv.opts.clickToSegmentMaxDistanceMM = value;
    }
  }

  handleMagicWandThresholdChange(value: number): void {
    this.drawingOptions = { ...this.drawingOptions, magicWandThresholdPercent: value };
    if (this.drawingOptions.mode === 'wand') {
      this.nv.opts.clickToSegmentPercent = value;
    }
  }

  handleDrawUndo(): void {
    this.nv.drawUndo();
  }

  async handleSaveDrawing(): Promise<void> {
    if (!this.nv.drawBitmap || this.nv.volumes.length === 0) {
      return;
    }
    try {
      const drawingData = (await this.nv.saveImage({ filename: '', isSaveDrawing: true, volumeByIndex: 0 })) as Uint8Array;
      const drawingFile = new File([drawingData], this.drawingOptions.filename, { type: 'application/octet-stream' });
      this.nv.setDrawingEnabled(false);
      this.nv.setPenValue(0, false);
      this.nv.opts.clickToSegment = false;
      this.nv.closeDrawing();
      const nvimage = await NVImage.loadFromFile({ file: drawingFile, name: this.drawingOptions.filename });
      nvimage.colormap = 'red';
      nvimage.opacity = 1;
      this.nv.addVolume(nvimage);
      this.updateImageDetails();
      this.drawingOptions = { ...this.drawingOptions, enabled: false, mode: 'none' };
      this.activeTab = 'sceneDetails';
      this.currentImageIndex = this.nv.volumes.length - 1;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to save drawing', error);
    }
  }

  handleLogout(): void {
    if (this.logoutUrl) {
      window.location.href = this.logoutUrl;
    }
  }

  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
}
