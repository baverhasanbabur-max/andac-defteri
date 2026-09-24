const ADMIN_PIN = "2468";

const seedStudents = [
  {
    name: "Ayşe Yılmaz",
    class_name: "12-A",
    motto: "Birlikte geçen yıllar unutulmaz.",
    photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600",
    target: 5
  },
  {
    name: "Mehmet Demir",
    class_name: "12-A",
    motto: "Güzel anılar biriktirdik.",
    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600",
    target: 5
  },
  {
    name: "Zeynep Kaya",
    class_name: "12-B",
    motto: "Her günün ayrı bir hikâyesi vardı.",
    photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600",
    target: 5
  },
  {
    name: "Ali Çelik",
    class_name: "12-B",
    motto: "Son zil çaldı ama anılar kalıyor.",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600",
    target: 5
  },
  {
    name: "Elif Şahin",
    class_name: "12-C",
    motto: "Birlikte gülüp birlikte büyüdük.",
    photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600",
    target: 5
  },
  {
    name: "Burak Arslan",
    class_name: "12-C",
    motto: "Bu sınıfın hikâyesi burada bitmiyor.",
    photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600",
    target: 5
  }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function isAdmin(req) {
  return req.headers.get("x-admin-pin") === ADMIN_PIN;
}

async function ensureSeed(env) {
  const result = await env.ANDAC_DB
    .prepare("SELECT COUNT(*) AS count FROM students")
    .first();

  if (Number(result?.count || 0) > 0) {
    return;
  }

  for (const student of seedStudents) {
    await env.ANDAC_DB
      .prepare(`
        INSERT INTO students
        (name, class_name, motto, photo, target)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        student.name,
        student.class_name,
        student.motto,
        student.photo,
        student.target
      )
      .run();
  }
}

async function getStudents(env) {
  const result = await env.ANDAC_DB
    .prepare(`
      SELECT
        s.id,
        s.name,
        s.class_name,
        s.motto,
        s.photo,
        s.target,
        COUNT(
          CASE WHEN n.status = 'approved'
          THEN 1 END
        ) AS approved_count
      FROM students s
      LEFT JOIN notes n
        ON n.student_id = s.id
      GROUP BY
        s.id,
        s.name,
        s.class_name,
        s.motto,
        s.photo,
        s.target
      ORDER BY
        s.class_name ASC,
        s.name ASC
    `)
    .all();

  return result.results || [];
}

async function getNotes(env, url, admin = false) {
  const studentId = url.searchParams.get("student");
  const status = url.searchParams.get("status");

  let sql = `
    SELECT
      n.id,
      n.student_id,
      s.name AS student_name,
      s.class_name,
      n.writer_name,
      n.relationship,
      n.content,
      n.status,
      n.created_at
    FROM notes n
    JOIN students s
      ON s.id = n.student_id
  `;

  const conditions = [];
  const params = [];

  if (!admin) {
    conditions.push("n.status = ?");
    params.push("approved");
  }

  if (studentId) {
    conditions.push("n.student_id = ?");
    params.push(Number(studentId));
  }

  if (admin && status && status !== "all") {
    conditions.push("n.status = ?");
    params.push(status);
  }

  if (conditions.length) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY n.created_at DESC";

  const result = await env.ANDAC_DB
    .prepare(sql)
    .bind(...params)
    .all();

  return result.results || [];
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function createCSV(rows) {
  const headers = [
    "ID",
    "Öğrenci",
    "Sınıf",
    "Yazan",
    "İlişki",
    "Andaç Yazısı",
    "Durum",
    "Tarih"
  ];

  const output = [
    headers.map(csvEscape).join(";")
  ];

  for (const row of rows) {
    output.push([
      row.id,
      row.student_name,
      row.class_name,
      row.writer_name,
      row.relationship,
      row.content,
      row.status,
      row.created_at
    ].map(csvEscape).join(";"));
  }

  return "\uFEFF" + output.join("\r\n");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createXLS(rows) {
  const headers = [
    "ID",
    "Öğrenci",
    "Sınıf",
    "Yazan",
    "İlişki",
    "Andaç Yazısı",
    "Durum",
    "Tarih"
  ];

  let output = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
 xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">

<Worksheet ss:Name="Andaçlar">
<Table>
`;

  output += "<Row>";

  for (const header of headers) {
    output += `
<Cell>
<Data ss:Type="String">${xmlEscape(header)}</Data>
</Cell>`;
  }

  output += "</Row>";

  for (const row of rows) {
    output += "<Row>";

    const values = [
      row.id,
      row.student_name,
      row.class_name,
      row.writer_name,
      row.relationship,
      row.content,
      row.status,
      row.created_at
    ];

    for (const value of values) {
      output += `
<Cell>
<Data ss:Type="String">${xmlEscape(value)}</Data>
</Cell>`;
    }

    output += "</Row>";
  }

  output += `
</Table>
</Worksheet>
</Workbook>`;

  return output;
}

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  /*
   * Sağlık kontrolü
   */
  if (method === "GET" && path === "/api/health") {
    return json({
      ok: true,
      app: "andac-defteri"
    });
  }

  /*
   * İlk açılışta örnek öğrencileri ekle
   */
  await ensureSeed(env);

  /*
   * ÖĞRENCİLER
   */
  if (method === "GET" && path === "/api/students") {
    return json(await getStudents(env));
  }

  /*
   * NOTLAR
   *
   * Normal kullanıcı:
   * sadece approved kayıtları görür.
   *
   * Admin:
   * tüm kayıtları görür.
   */
  if (method === "GET" && path === "/api/notes") {
    const admin = isAdmin(req);

    return json(
      await getNotes(env, url, admin)
    );
  }

  /*
   * YENİ ANDAÇ
   */
  if (method === "POST" && path === "/api/notes") {
    const data = await body(req);

    const studentId = Number(data.student_id);

    /*
     * Frontend'in eski ve yeni isimlerini de destekle
     */
    const writerName = String(
      data.writer_name ||
      data.author_name ||
      ""
    ).trim();

    const relationship = String(
      data.relationship || ""
    ).trim();

    const content = String(
      data.content ||
      data.message ||
      ""
    ).trim();

    if (!studentId) {
      return json({
        error: "Öğrenci seçilmedi."
      }, 400);
    }

    if (!writerName) {
      return json({
        error: "Adını yazmalısın."
      }, 400);
    }

    if (!relationship) {
      return json({
        error: "İlişki bilgisi gerekli."
      }, 400);
    }

    if (content.length < 20) {
      return json({
        error: "Andaç yazısı en az 20 karakter olmalıdır."
      }, 400);
    }

    if (content.length > 600) {
      return json({
        error: "Andaç yazısı en fazla 600 karakter olabilir."
      }, 400);
    }

    const student = await env.ANDAC_DB
      .prepare(`
        SELECT id
        FROM students
        WHERE id = ?
      `)
      .bind(studentId)
      .first();

    if (!student) {
      return json({
        error: "Öğrenci bulunamadı."
      }, 404);
    }

    const result = await env.ANDAC_DB
      .prepare(`
        INSERT INTO notes
        (
          student_id,
          writer_name,
          relationship,
          content,
          status,
          created_at
        )
        VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
      `)
      .bind(
        studentId,
        writerName,
        relationship,
        content
      )
      .run();

    return json({
      ok: true,
      id: result.meta?.last_row_id || null,
      message: "Andaçınız başarıyla gönderildi."
    });
  }

  /*
   * FOTOĞRAFÇI GİRİŞİ
   *
   * PIN = 2468
   */
  if (
    method === "POST" &&
    path === "/api/admin/login"
  ) {
    const data = await body(req);

    const pin = String(
      data.pin || ""
    ).trim();

    if (pin === ADMIN_PIN) {
      return json({
        ok: true,
        message: "Giriş başarılı."
      });
    }

    return json({
      error: "PIN hatalı"
    }, 401);
  }

  /*
   * BURADAN SONRASI ADMIN
   */
  if (path.startsWith("/api/") && !isAdmin(req)) {
    return json({
      error: "Yetkisiz"
    }, 401);
  }

  /*
   * ANDAÇ DURUMU DEĞİŞTİR
   */
  if (
    method === "PATCH" &&
    path.startsWith("/api/notes/")
  ) {
    const id = Number(
      path.split("/").pop()
    );

    if (!id) {
      return json({
        error: "Geçersiz andaç ID."
      }, 400);
    }

    const data = await body(req);

    const updates = [];
    const values = [];

    if (data.writer_name !== undefined) {
      updates.push("writer_name = ?");
      values.push(
        String(data.writer_name).trim()
      );
    }

    if (data.relationship !== undefined) {
      updates.push("relationship = ?");
      values.push(
        String(data.relationship).trim()
      );
    }

    if (data.content !== undefined) {
      const content = String(data.content).trim();

      if (content.length > 600) {
        return json({
          error: "Andaç yazısı en fazla 600 karakter olabilir."
        }, 400);
      }

      updates.push("content = ?");
      values.push(content);
    }

    if (data.status !== undefined) {
      const status = String(data.status);

      if (
        ![
          "pending",
          "approved",
          "rejected"
        ].includes(status)
      ) {
        return json({
          error: "Geçersiz durum."
        }, 400);
      }

      updates.push("status = ?");
      values.push(status);
    }

    if (!updates.length) {
      return json({
        error: "Güncellenecek alan yok."
      }, 400);
    }

    values.push(id);

    const result = await env.ANDAC_DB
      .prepare(`
        UPDATE notes
        SET ${updates.join(", ")}
        WHERE id = ?
      `)
      .bind(...values)
      .run();

    if (!result.meta?.changes) {
      return json({
        error: "Andaç bulunamadı."
      }, 404);
    }

    return json({
      ok: true
    });
  }

  /*
   * ANDAÇ SİL
   */
  if (
    method === "DELETE" &&
    path.startsWith("/api/notes/")
  ) {
    const id = Number(
      path.split("/").pop()
    );

    if (!id) {
      return json({
        error: "Geçersiz andaç ID."
      }, 400);
    }

    const result = await env.ANDAC_DB
      .prepare(`
        DELETE FROM notes
        WHERE id = ?
      `)
      .bind(id)
      .run();

    if (!result.meta?.changes) {
      return json({
        error: "Andaç bulunamadı."
      }, 404);
    }

    return json({
      ok: true
    });
  }

  /*
   * YENİ ÖĞRENCİ
   */
  if (
    method === "POST" &&
    path === "/api/students"
  ) {
    const data = await body(req);

    const name = String(
      data.name || ""
    ).trim();

    const className = String(
      data.class_name ||
      data.className ||
      ""
    ).trim();

    const motto = String(
      data.motto || ""
    ).trim();

    const photo = String(
      data.photo ||
      data.photo_url ||
      data.photoUrl ||
      ""
    ).trim();

    const target = Number(
      data.target || 5
    );

    if (!name) {
      return json({
        error: "Öğrenci adı gerekli."
      }, 400);
    }

    if (!className) {
      return json({
        error: "Sınıf gerekli."
      }, 400);
    }

    const result = await env.ANDAC_DB
      .prepare(`
        INSERT INTO students
        (
          name,
          class_name,
          motto,
          photo,
          target
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        name,
        className,
        motto,
        photo,
        target
      )
      .run();

    return json({
      ok: true,
      id: result.meta?.last_row_id || null
    });
  }

  /*
   * ÖĞRENCİ SİL
   */
  if (
    method === "DELETE" &&
    path.startsWith("/api/students/")
  ) {
    const id = Number(
      path.split("/").pop()
    );

    if (!id) {
      return json({
        error: "Geçersiz öğrenci ID."
      }, 400);
    }

    await env.ANDAC_DB
      .prepare(`
        DELETE FROM notes
        WHERE student_id = ?
      `)
      .bind(id)
      .run();

    const result = await env.ANDAC_DB
      .prepare(`
        DELETE FROM students
        WHERE id = ?
      `)
      .bind(id)
      .run();

    if (!result.meta?.changes) {
      return json({
        error: "Öğrenci bulunamadı."
      }, 404);
    }

    return json({
      ok: true
    });
  }

  /*
   * CSV
   */
  if (
    method === "GET" &&
    path === "/api/export.csv"
  ) {
    const rows = await getNotes(
      env,
      url,
      true
    );

    return new Response(
      createCSV(rows),
      {
        headers: {
          "content-type":
            "text/csv; charset=utf-8",

          "content-disposition":
            'attachment; filename="andaclar.csv"',

          "cache-control":
            "no-store"
        }
      }
    );
  }

  /*
   * EXCEL
   */
  if (
    method === "GET" &&
    path === "/api/export.xls"
  ) {
    const rows = await getNotes(
      env,
      url,
      true
    );

    return new Response(
      createXLS(rows),
      {
        headers: {
          "content-type":
            "application/vnd.ms-excel; charset=utf-8",

          "content-disposition":
            'attachment; filename="andaclar.xls"',

          "cache-control":
            "no-store"
        }
      }
    );
  }

  /*
   * FRONTEND
   */
  return env.ASSETS.fetch(req);
}

export default {
  async fetch(req, env, ctx) {
    try {
      return await route(req, env);
    } catch (error) {
      console.error(
        "ANDAÇ DEFTERİ SERVER ERROR:",
        error
      );

      return json({
        error: "Sunucu hatası",
        detail: error?.message || String(error)
      }, 500);
    }
  }
};
