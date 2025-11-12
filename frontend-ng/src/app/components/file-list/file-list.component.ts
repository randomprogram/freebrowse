import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { DirectoryItem, DirectoryListingResponse, FileItem } from '../../types';

interface Breadcrumb {
  label: string;
  path: string;
}

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-list.component.html',
  styleUrls: ['./file-list.component.scss'],
})
export class FileListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() endpoint = '';
  @Input() emptyMessage = 'No files available.';
  @Output() fileSelect = new EventEmitter<FileItem>();

  files: FileItem[] = [];
  directories: DirectoryItem[] = [];
  loading = false;
  error = '';
  currentPath = '';
  resolvedPath = '';

  private initialised = false;
  private abortController?: AbortController;

  ngOnInit(): void {
    this.restorePath();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['endpoint'] && !changes['endpoint'].firstChange) {
      this.restorePath();
    }
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }

  get breadcrumbs(): Breadcrumb[] {
    const parts = this.resolvedPath.split('/').filter(Boolean);
    const crumbs: Breadcrumb[] = [{ label: 'Root', path: '' }];
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      crumbs.push({ label: part, path });
    });
    return crumbs;
  }

  navigateTo(path: string): void {
    this.currentPath = path;
    this.fetchFiles();
  }

  selectFile(file: FileItem): void {
    this.fileSelect.emit(file);
  }

  fileLabel(file: FileItem): string {
    const parts = file.filename.split('/');
    return parts[parts.length - 1] || file.filename;
  }

  private restorePath(): void {
    if (!this.endpoint) {
      return;
    }
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem(this.storageKey)
      : '';
    this.currentPath = stored ?? '';
    this.resolvedPath = stored ?? '';
    this.initialised = true;
    this.fetchFiles();
  }

  private get storageKey(): string {
    return `file-list-path:${this.endpoint}`;
  }

  private async fetchFiles(): Promise<void> {
    if (!this.endpoint || !this.initialised) {
      return;
    }

    this.abortController?.abort();
    this.abortController = new AbortController();
    this.loading = true;
    this.error = '';

    try {
      const url = this.currentPath
        ? `${this.endpoint}?path=${encodeURIComponent(this.currentPath)}`
        : this.endpoint;
      const response = await fetch(url, { signal: this.abortController.signal });
      if (!response.ok) {
        const error: any = new Error(`HTTP error ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const data: DirectoryListingResponse | FileItem[] = await response.json();
      if (Array.isArray(data)) {
        this.directories = [];
        this.files = data;
        this.resolvedPath = this.currentPath;
      } else {
        this.directories = data.directories ?? [];
        this.files = data.files ?? [];
        this.resolvedPath = data.currentPath ?? this.currentPath;
        this.currentPath = this.resolvedPath;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(this.storageKey, this.resolvedPath);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      this.error = error?.message ?? 'Failed to load files';
      if (error?.status === 404) {
        this.currentPath = '';
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(this.storageKey);
        }
      }
    } finally {
      this.loading = false;
    }
  }
}
