import Tabify from "./tabify";
import { getKlangioKey } from "../lib/klangio";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Tabify demo={!getKlangioKey()} />;
}
