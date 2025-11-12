import { Routes } from '@angular/router';
import { FreebrowseComponent } from './components/freebrowse/freebrowse.component';

export const appRoutes: Routes = [
  { path: '', component: FreebrowseComponent },
  { path: '**', redirectTo: '' },
];
