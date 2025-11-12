import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Niivue, SHOW_RENDER } from '@niivue/niivue';
import { ViewMode } from '../../types';

export const sliceTypeMap: Record<ViewMode, { sliceType: number; showRender: number }> = {
  axial: { sliceType: 0, showRender: SHOW_RENDER.NEVER },
  coronal: { sliceType: 1, showRender: SHOW_RENDER.NEVER },
  sagittal: { sliceType: 2, showRender: SHOW_RENDER.NEVER },
  ACS: { sliceType: 3, showRender: SHOW_RENDER.NEVER },
  ACSR: { sliceType: 3, showRender: SHOW_RENDER.ALWAYS },
  render: { sliceType: 4, showRender: SHOW_RENDER.ALWAYS },
};

@Component({
  selector: 'app-image-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-canvas.component.html',
  styleUrls: ['./image-canvas.component.scss'],
})
export class ImageCanvasComponent implements AfterViewInit, OnChanges {
  @Input() nv: Niivue | null = null;
  @Input() viewMode: ViewMode = 'ACS';
  @ViewChild('canvasEl', { static: false }) canvasEl?: ElementRef<HTMLCanvasElement>;

  imageLoaded = false;

  ngAfterViewInit(): void {
    this.attach();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['nv'] && !changes['nv'].firstChange) {
      this.attach();
    }
  }

  private attach(): void {
    if (!this.nv || !this.canvasEl) {
      return;
    }

    try {
      this.nv.attachToCanvas(this.canvasEl.nativeElement);
      this.imageLoaded = true;
    } catch (error) {
      console.error('Failed to attach Niivue canvas', error);
    }
  }

  get showLabel(): boolean {
    return this.viewMode !== 'ACS' && this.viewMode !== 'ACSR';
  }
}
