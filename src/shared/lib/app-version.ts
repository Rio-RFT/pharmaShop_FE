import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export function getAppDisplayVersion() {
  const version = Constants.expoConfig?.version ?? 'Không xác định';
  const channel = Updates.channel;
  const buildNumber = Constants.nativeBuildVersion;

  if (!channel || !buildNumber) return version;
  return `${version}-${channel}.${buildNumber}`;
}
