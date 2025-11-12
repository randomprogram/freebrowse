import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-image-uploader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-uploader.component.html',
  styleUrls: ['./image-uploader.component.scss'],
})
export class ImageUploaderComponent {
  @Input() compact = false;
  @Output() upload = new EventEmitter<File[]>();
  @ViewChild('fileInput', { static: false }) fileInput?: ElementRef<HTMLInputElement>;

  isDragging = false;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(): void {
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files?.length) {
      this.emitFiles(Array.from(event.dataTransfer.files));
    }
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.emitFiles(Array.from(input.files));
      input.value = '';
    }
  }

  openFileDialog(): void {
    this.fileInput?.nativeElement.click();
  }

  private emitFiles(files: File[]): void {
    if (files.length) {
      this.upload.emit(files);
    }
  }
}
