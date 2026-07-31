import { redirect } from 'next/navigation';

/** Product Suite (~290 tools) removed from product UX — redirect to binary terminal. */
export default function ProductsRedirectPage() {
  redirect('/binary');
}
