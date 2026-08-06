import io.github.spannm.jackcess.*;
import io.github.spannm.jackcess.query.Query;
import java.io.File;
import java.util.*;

public class Inspect {
    public static void main(String[] args) throws Exception {
        File f = new File(args[0]);
        try (Database db = DatabaseBuilder.open(f)) {
            System.out.println("### FILE FORMAT: " + db.getFileFormat());
            System.out.println();

            List<String> names = new ArrayList<>(db.getTableNames());
            Collections.sort(names);
            System.out.println("### USER TABLES (" + names.size() + ")");
            for (String n : names) {
                Table t = db.getTable(n);
                StringBuilder cols = new StringBuilder();
                for (Column c : t.getColumns()) {
                    if (cols.length() > 0) cols.append(", ");
                    cols.append(c.getName()).append(":").append(c.getType());
                }
                System.out.printf("%-45s rows=%-7d cols=%d%n", n, t.getRowCount(), t.getColumnCount());
                System.out.println("    " + cols);
            }

            System.out.println();
            Set<String> sys = db.getSystemTableNames();
            System.out.println("### SYSTEM TABLES (" + sys.size() + "): " + sys);

            System.out.println();
            List<Query> qs = db.getQueries();
            System.out.println("### SAVED QUERIES (" + qs.size() + ")");
            for (Query q : qs) {
                System.out.println("--- " + q.getName() + "  [" + q.getType() + "]");
                try {
                    System.out.println(q.toSQLString());
                } catch (Exception e) {
                    System.out.println("    <could not render: " + e + ">");
                }
                System.out.println();
            }
        }
    }
}
