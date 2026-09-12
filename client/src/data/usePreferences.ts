import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PREF_CLOUD_PROMPT_ANSWERED,
  PREF_WELCOME_DISMISSED,
  countPrescriptions,
  readFlag,
  setFlag,
} from './preferences';

const prefKey = (key: string) => ['preferences', key] as const;

function useFlag(key: string) {
  return useQuery({
    queryKey: prefKey(key),
    queryFn: () => readFlag(key),
    // A local read, and the value only changes when this app writes it.
    staleTime: Infinity,
  });
}

function useDismiss(key: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: () => setFlag(key, true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prefKey(key) }),
  });
}

export function useWelcomeCard() {
  const dismissed = useFlag(PREF_WELCOME_DISMISSED);
  const dismiss = useDismiss(PREF_WELCOME_DISMISSED);

  return {
    // Explicitly `=== false` rather than `!dismissed.data`: while the query is
    // still loading the value is undefined, and the card must stay hidden then
    // or it flashes onto a device where it was dismissed months ago.
    visible: dismissed.data === false,
    dismiss: dismiss.mutate,
  };
}

/** Records held before cloud backup is worth mentioning. */
const CLOUD_PROMPT_THRESHOLD = 5;

/**
 * Whether to ask about cloud backup.
 *
 * Not on first launch: someone with no records has nothing to lose and no
 * reason to care. The moment backup becomes appealing is once losing the phone
 * would actually hurt, which is why this waits for a few visits to accumulate.
 */
export function useCloudPrompt() {
  const answered = useFlag(PREF_CLOUD_PROMPT_ANSWERED);
  const dismiss = useDismiss(PREF_CLOUD_PROMPT_ANSWERED);

  const total = useQuery({
    queryKey: ['preferences', 'prescription-count'],
    queryFn: countPrescriptions,
  });

  return {
    visible: answered.data === false && (total.data ?? 0) >= CLOUD_PROMPT_THRESHOLD,
    dismiss: dismiss.mutate,
  };
}