import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ customer_id?: string }>;
};

export default async function OrderNewRedirect({ searchParams }: Props) {
  const q = await searchParams;
  if (q.customer_id) {
    redirect(`/?customer_id=${encodeURIComponent(q.customer_id)}`);
  }
  redirect("/");
}
