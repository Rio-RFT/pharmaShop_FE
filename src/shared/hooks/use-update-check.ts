import { createContext, useContext } from 'react';

export const UpdateCheckContext = createContext<(() => void) | null>(null);

export function useUpdateCheck() {
  const checkForUpdate = useContext(UpdateCheckContext);
  if (!checkForUpdate) throw new Error('UpdateCheckContext is missing from the app tree.');
  return checkForUpdate;
}
