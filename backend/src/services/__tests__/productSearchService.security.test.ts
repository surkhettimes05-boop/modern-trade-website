import { query } from "../../database/connection.js";
import { ProductSearchService } from "../productSearchService.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe("product search security", () => {
  beforeEach(() => mockedQuery.mockReset());

  it("binds the authoritative store filter independently from pagination", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

    await new ProductSearchService().searchProducts({
      query: "rice",
      limit: 25,
      offset: 50,
      store_id: "00000000-0000-4000-8000-000000000001",
    });

    const [sql, parameters] = mockedQuery.mock.calls[0];
    expect(sql).toContain("store_id = $4");
    expect(sql).toContain("LIMIT $2 OFFSET $3");
    expect(parameters).toEqual([
      "rice",
      25,
      50,
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("does not write raw search text to logs", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await new ProductSearchService().logZeroResultSearch(
        "private customer phrase",
        "en",
      );
      expect(log).toHaveBeenCalledWith(
        JSON.stringify({
          event: "zero_result_search",
          language: "en",
          queryLength: 23,
        }),
      );
      expect(log.mock.calls.flat().join(" ")).not.toContain(
        "private customer phrase",
      );
    } finally {
      log.mockRestore();
    }
  });
});
