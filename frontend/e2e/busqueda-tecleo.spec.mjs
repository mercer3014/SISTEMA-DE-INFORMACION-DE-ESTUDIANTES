import { test, expect } from "@playwright/test";

const FRASE = "Ana Maria Fernandez Lopez 202012345";

const ESTUDIANTE = {
  registro: "202012345",
  nombre_completo: "ANA MARIA FERNANDEZ LOPEZ",
  ci: "12345678",
  sexo: "F",
  facultad_id: 1,
  facultad: "Tecnologia",
  carrera_id: 10,
  carrera: "Sistemas",
  sede: "La Paz",
  gestion_ingreso: 2020,
  activo: true,
  en_padron: false,
  en_web: true,
  relevancia: 1,
};

async function mockApi(page) {
  await page.route("**/api/catalogos/facultades**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, nombre: "Tecnologia", total: 12 }]),
    });
  });
  await page.route("**/api/catalogos/carreras**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 10, nombre: "Sistemas", facultad_id: 1, total: 8 }]),
    });
  });
  await page.route("**/api/catalogos/sedes**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, nombre: "La Paz", total: 12 }]),
    });
  });
  await page.route("**/api/catalogos/gestiones**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ gestion: 2020, total: 12 }]),
    });
  });
  await page.route("**/api/estudiantes**", async (route) => {
    const delay = 300 + Math.floor(Math.random() * 501);
    await new Promise((r) => setTimeout(r, delay));
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").trim();
    const data = q ? [ESTUDIANTE] : [{ ...ESTUDIANTE, registro: "201900001", nombre_completo: "JUAN PEREZ" }];
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data,
          total: data.length,
          page: 1,
          page_size: Number(url.searchParams.get("page_size") || 1000),
          pages: 1,
        }),
      });
    } catch {
      // La petición se abortó al llegar una búsqueda más reciente.
    }
  });
}

async function mismoNodo(a, b) {
  return a.evaluate((el, other) => el === other, b);
}

test("el tecleo rápido no remonta la página y sólo actualiza resultados", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  const input = page.getByTestId("busqueda-input");
  const filtro = page.getByTestId("filtro-buscar-facultad");
  const encabezado = page.getByTestId("encabezado");
  const secciones = page.getByTestId("secciones");
  const raiz = page.getByTestId("busqueda-raiz");
  const resultados = page.getByTestId("resultados");

  await expect(input).toBeVisible();
  await expect(filtro).toBeAttached();
  await expect(encabezado).toBeVisible();
  await expect(resultados).toBeVisible();

  const inputEl = await input.elementHandle();
  const filtroEl = await filtro.elementHandle();
  const encabezadoEl = await encabezado.elementHandle();
  const seccionesEl = await secciones.elementHandle();
  const resultadosEl = await resultados.elementHandle();
  const mountId = await raiz.getAttribute("data-mount-id");
  const inputMount = await input.getAttribute("data-mount-id");
  expect(mountId).toBeTruthy();
  expect(inputMount).toBe(mountId);

  // En celular el sidebar está en el DOM pero oculto; sólo se escribe en el
  // buscador de facultad cuando es visible (escritorio). En ambos casos el
  // nodo tiene que seguir siendo el mismo después de teclear en la búsqueda.
  const filtroVisible = await filtro.isVisible();
  if (filtroVisible) {
    await filtro.fill("tec");
    expect(await filtro.inputValue()).toBe("tec");
  }

  await input.click();
  await input.fill("");
  await page.keyboard.type(FRASE, { delay: 0 });
  await expect(input).toHaveValue(FRASE);

  await expect.poll(async () => mismoNodo(inputEl, await input.elementHandle())).toBe(true);
  await expect.poll(async () => mismoNodo(filtroEl, await filtro.elementHandle())).toBe(true);
  expect(await mismoNodo(encabezadoEl, await encabezado.elementHandle())).toBe(true);
  expect(await mismoNodo(seccionesEl, await secciones.elementHandle())).toBe(true);
  expect(await mismoNodo(resultadosEl, await resultados.elementHandle())).toBe(true);
  expect(await raiz.getAttribute("data-mount-id")).toBe(mountId);
  expect(await input.getAttribute("data-mount-id")).toBe(inputMount);
  if (filtroVisible) expect(await filtro.inputValue()).toBe("tec");

  // Segunda pasada más lenta: el valor final sigue coincidiendo exactamente.
  const segunda = "x".repeat(FRASE.length);
  await input.click();
  await input.fill("");
  await page.keyboard.type(segunda, { delay: 20 });
  await expect(input).toHaveValue(segunda);
  expect(await mismoNodo(inputEl, await input.elementHandle())).toBe(true);
  expect(await mismoNodo(filtroEl, await filtro.elementHandle())).toBe(true);
  expect(await mismoNodo(encabezadoEl, await encabezado.elementHandle())).toBe(true);
  expect(await raiz.getAttribute("data-mount-id")).toBe(mountId);
  if (filtroVisible) expect(await filtro.inputValue()).toBe("tec");

  // Los resultados siguen visibles (sin skeleton de página) mientras se actualizan.
  await expect(resultados).toBeVisible();
  await expect(page.getByTestId("resultados-actualizando").or(resultados)).toBeVisible();
});
