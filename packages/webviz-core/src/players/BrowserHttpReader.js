// @flow
//
//  Copyright (c) 2019-present, GM Cruise LLC
//
//  This source code is licensed under the Apache License, Version 2.0,
//  found in the LICENSE file in the root directory of this source tree.
//  You may not use this file except in compliance with the License.

import FetchReader from "webviz-core/src/players/FetchReader";
import type { FileReader, FileStream } from "webviz-core/src/util/CachedFilelike";

export default class BrowserHttpReader implements FileReader {
  _url: string;

  constructor(url: string) {
    this._url = url;
  }

  async open() {
    let response;
    try {
      // Make a GET request and then immediately cancel it. This is more robust than a HEAD request,
      // since the server might not accept HEAD requests (e.g. when using S3 presigned URLs that
      // only work for one particular method like GET).
      // Note that we cannot use `range: "bytes=0-1"` or so, because then we can't get the actual
      // file size without making Content-Range a CORS header, therefore making all this a bit less
      // robust.
      const controller = new AbortController();
      response = await fetch(this._url, { signal: controller.signal });
      controller.abort();
    } catch (error) {
      throw new Error(
        `Fetching remote file failed. Often this is due to missing CORS headers on the requested URL.\n\n${error}`
      );
    }
    if (!response || !response.ok) {
      throw new Error(
        `Fetching remote file failed. Often this is due to missing CORS headers on the requested URL. Status code: ${
          response.status
        }.`
      );
    }
    if (response.headers.get("accept-ranges") !== "bytes") {
      throw new Error(
        "Remote file does not support HTTP Range Requests. Often this is due to missing CORS headers on the requested URL."
      );
    }
    const size = response.headers.get("content-length");
    if (!size) {
      throw new Error(
        "Remote file is missing file size. Often this is due to missing CORS headers on the requested URL."
      );
    }
    return { size: parseInt(size), identifier: response.headers.get("etag") || response.headers.get("last-modified") };
  }

  fetch(offset: number, length: number): FileStream {
    const headers = new Headers({ range: `bytes=${offset}-${offset + (length - 1)}` });
    // $FlowFixMe - Flow doesn't understand that this *does* have the right type.
    return new FetchReader(this._url, headers);
  }

  recordBytesPerSecond(bytesPerSecond: number): void {}
}
