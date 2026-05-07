import { useLocalSearchParams } from 'expo-router';
import EventForm from '@/components/event-form';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) {
    return null;
  }
  return <EventForm mode="edit" eventId={id} />;
}
