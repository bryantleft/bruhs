import { ConvexAuthProvider, useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { ConvexReactClient, useConvexAuth } from 'convex/react';
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { createPartyService } from './client';
import { PartyProvider } from './PartyProvider';
import { createPartyTokenStore } from './partyTokenStore';
import { createPartySession, createPartyStorage, type PartyStorage } from './session';
import { createStepUpload } from './upload';

const endpoint = process.env.EXPO_PUBLIC_CONVEX_URL;
function configuredClient(): ConvexReactClient | null {
  if (!endpoint) return null;
  try {
    return new ConvexReactClient(endpoint, { unsavedChangesWarning: false });
  } catch {
    console.warn('Party service configuration could not be opened.');
    return null;
  }
}
const client = configuredClient();

function ConnectedParty({
  children,
  client,
  storage,
}: PropsWithChildren<{
  client: ConvexReactClient;
  storage: PartyStorage;
}>): React.JSX.Element {
  const actions = useAuthActions();
  const latestActions = useRef(actions);
  latestActions.current = actions;
  const auth = useConvexAuth();
  const token = useAuthToken();
  const latestToken = useRef(token);
  latestToken.current = token;
  const [session] = useState(() =>
    createPartySession(
      {
        signIn: () => latestActions.current.signIn('anonymous'),
        signOut: () => latestActions.current.signOut(),
      },
      storage,
    ),
  );
  const [service] = useState(() =>
    createPartyService(
      client,
      session,
      createStepUpload(client.url, () => latestToken.current),
    ),
  );
  useEffect(() => {
    session.update(auth);
  }, [session, auth]);
  return (
    <PartyProvider service={service} hasSession={auth.isAuthenticated}>
      {children}
    </PartyProvider>
  );
}

export function PartyBackend({ children }: PropsWithChildren): React.JSX.Element {
  // SecureStore on iOS and Android, moving logins saved by earlier builds out of
  // AsyncStorage; AsyncStorage (localStorage) on web.
  const [storage] = useState(() => createPartyStorage(createPartyTokenStore()));
  if (!client)
    return (
      <PartyProvider service={null} hasSession={false}>
        {children}
      </PartyProvider>
    );
  return (
    <ConvexAuthProvider
      client={client}
      storage={storage.storage}
      storageNamespace={`bruhs-outside-convex-v1-${client.url}`}
      shouldHandleCode={false}
    >
      <ConnectedParty client={client} storage={storage}>
        {children}
      </ConnectedParty>
    </ConvexAuthProvider>
  );
}
