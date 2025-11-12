import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DRAG_MODE } from '@niivue/niivue';
import { DragMode } from '../../types';

type DragConfig = Record<DragMode, { label: string; short: string }>; 

const CONFIG: DragConfig = {
  none: { label: 'None', short: 'None' },
  contrast: { label: 'Contrast', short: 'Contrast' },
  measurement: { label: 'Measurement', short: 'Measure' },
  pan: { label: 'Pan/Zoom', short: 'Pan' },
  slicer3D: { label: 'Slicer 3D', short: 'Slicer' },
  callbackOnly: { label: 'Callback Only', short: 'Callback' },
  roiSelection: { label: 'ROI', short: 'ROI' },
  angle: { label: 'Angle', short: 'Angle' },
  crosshair: { label: 'Crosshair', short: 'Crosshair' },
  windowing: { label: 'Windowing', short: 'Window' },
};

const DEFAULT_MODES = (Object.keys(DRAG_MODE).filter((key) => isNaN(Number(key))) as DragMode[]);

@Component({
  selector: 'app-drag-mode-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './drag-mode-selector.component.html',
  styleUrls: ['./drag-mode-selector.component.scss'],
})
export class DragModeSelectorComponent {
  @Input() currentMode: DragMode = 'contrast';
  @Input() availableModes: DragMode[] = DEFAULT_MODES;
  @Output() modeChange = new EventEmitter<DragMode>();

  select(mode: DragMode): void {
    this.modeChange.emit(mode);
  }

  labelFor(mode: DragMode): string {
    return CONFIG[mode]?.label ?? mode;
  }
}
