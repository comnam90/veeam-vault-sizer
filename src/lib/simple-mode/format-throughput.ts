import type { Throughput } from "@/types/vault-sizer-api";

// Bytes → bits; treats MB and Mb as equal-magnitude (the networking-domain
// convention), not the strict ×8.388608 that the field's underlying
// MiB-based calculation would imply.
export function formatThroughputMbps(throughput: Throughput): string {
  return `${(throughput.outboundMBps * 8).toFixed(1)} Mbps`;
}
