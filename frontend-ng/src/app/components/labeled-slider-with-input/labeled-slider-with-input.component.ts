import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-labeled-slider-with-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './labeled-slider-with-input.component.html',
  styleUrls: ['./labeled-slider-with-input.component.scss'],
})
export class LabeledSliderWithInputComponent implements OnChanges, OnDestroy {
  @Input() label = '';
  @Input() value = 0;
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() decimalPlaces = 2;
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<number>();

  localValue = 0;
  private debounceHandle?: ReturnType<typeof setTimeout>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this.localValue = this.value;
    }
  }

  ngOnDestroy(): void {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
  }

  onSliderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const nextValue = Number(target.value);
    this.applyValue(nextValue);
  }

  onNumberChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const parsed = Number(target.value);
    if (!Number.isNaN(parsed)) {
      this.applyValue(parsed);
    }
  }

  onNumberBlur(event: Event): void {
    const target = event.target as HTMLInputElement;
    let parsed = Number(target.value);
    if (Number.isNaN(parsed)) {
      parsed = this.value;
    }
    parsed = Math.min(Math.max(parsed, this.min), this.max);
    target.value = parsed.toString();
    this.applyValue(parsed, true);
  }

  private applyValue(value: number, immediate = false): void {
    const clamped = Math.min(Math.max(value, this.min), this.max);
    this.localValue = clamped;
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
    const emitValue = Number(clamped.toFixed(this.decimalPlaces));
    if (immediate) {
      this.valueChange.emit(emitValue);
      return;
    }
    this.debounceHandle = setTimeout(() => {
      this.valueChange.emit(emitValue);
    }, 75);
  }
}
