import { get, set } from "idb-keyval";
import type { Chat } from "@/lib/types";

const CHATS_KEY = "chats";

export async function getChats(): Promise<Chat[] | undefined> {
  return (await get(CHATS_KEY)) as Chat[] | undefined;
}

export async function setChats(chats: Chat[]): Promise<void> {
  await set(CHATS_KEY, chats);
}
