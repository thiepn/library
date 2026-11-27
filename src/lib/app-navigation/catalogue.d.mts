export interface NavigationApp {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly category: string;
}
export interface NavigationAction {
  readonly id: string;
  readonly appId: string;
  readonly label: string;
  readonly url: string;
}
export const NAVIGATION_VERSION: 1;
export const HUB_URL: string;
export const APPS: readonly NavigationApp[];
export const ACTIONS: readonly NavigationAction[];
