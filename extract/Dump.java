import io.github.spannm.jackcess.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class Dump {
    static String csv(Object v) {
        if (v == null) return "";
        String s = String.valueOf(v);
        if (s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
            return '"' + s.replace("\"", "\"\"") + '"';
        }
        return s;
    }

    public static void main(String[] args) throws Exception {
        File f = new File(args[0]);
        Path out = Paths.get(args[1]);
        Files.createDirectories(out);
        try (Database db = DatabaseBuilder.open(f)) {
            for (String n : db.getTableNames()) {
                Table t = db.getTable(n);
                List<String> cols = new ArrayList<>();
                for (Column c : t.getColumns()) cols.add(c.getName());
                Path p = out.resolve(n + ".csv");
                try (BufferedWriter w = Files.newBufferedWriter(p, StandardCharsets.UTF_8)) {
                    w.write(String.join(",", cols));
                    w.newLine();
                    int rows = 0;
                    for (Row r : t) {
                        StringJoiner sj = new StringJoiner(",");
                        for (String c : cols) sj.add(csv(r.get(c)));
                        w.write(sj.toString());
                        w.newLine();
                        rows++;
                    }
                    System.out.println(n + " -> " + p.getFileName() + " (" + rows + " rows)");
                }
            }
        }
    }
}
