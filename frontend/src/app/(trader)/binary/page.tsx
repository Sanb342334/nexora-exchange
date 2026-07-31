import { redirect } from 'next/navigation';

/** Legacy binary FX page → crypto markets home */
export default function BinaryRedirectPage() {
  redirect('/trade');
}
