import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ViewMode } from '../../types';

interface ViewOption {
  value: ViewMode;
  label: string;
  icon?: string;
}

@Component({
  selector: 'app-view-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './view-selector.component.html',
  styleUrls: ['./view-selector.component.scss'],
})
export class ViewSelectorComponent {
  @Input() currentView: ViewMode = 'ACS';
  @Output() viewChange = new EventEmitter<ViewMode>();

  readonly options: ViewOption[] = [
    { value: 'axial', label: 'Axial', icon: 'assets/images/axialSlice24.png' },
    { value: 'coronal', label: 'Coronal', icon: 'assets/images/coronalSlice24.png' },
    { value: 'sagittal', label: 'Sagittal', icon: 'assets/images/sagittalSlice24.png' },
    { value: 'render', label: 'Render' },
    { value: 'ACS', label: 'ACS' },
    { value: 'ACSR', label: 'ACSR' },
  ];

  select(option: ViewOption): void {
    this.viewChange.emit(option.value);
  }
}
