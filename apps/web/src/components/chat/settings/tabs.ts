// The settings tabs, apart from the dialog so the route can check `?settings=`
// without loading the dialog.
export const settingsTabs = ["general", "providers", "appearance", "github"] as const;

export type SettingsTab = (typeof settingsTabs)[number];
