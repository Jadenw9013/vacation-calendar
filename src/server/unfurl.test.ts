import { describe, expect, it } from "vitest";
import { isPrivateAddress, readTikTok } from "./unfurl";

describe("link previews", () => {
  it("reads a TikTok page's caption, author and cover from its embedded data", () => {
    const html = String.raw`<script>{"desc":"Sunrise on Indian Nose 🌅 #guatemala","author":{"uniqueId":"lakelife","nickname":"Lake"},"video":{"cover":"https://p16-sign.tiktokcdn-us.com/obj/abc~tplv.image?x-expires=1&x-signature=Z"}}</script>`;
    expect(readTikTok(html)).toEqual({
      caption: "Sunrise on Indian Nose 🌅 #guatemala",
      author: "lakelife",
      cover: "https://p16-sign.tiktokcdn-us.com/obj/abc~tplv.image?x-expires=1&x-signature=Z",
    });
  });

  it("never fetches private or local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "142.250.72.14", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
