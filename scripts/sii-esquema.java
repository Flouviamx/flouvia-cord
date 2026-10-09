// Validador independiente de esquemas XSD para scripts/sii-check.mjs, con
// javax.xml.validation de la JDK sobre el esquema OFICIAL sin tocar. Existe
// porque libxml2 (xmllint) no admite una faceta del esquema de los libros:
// LceSiiTypes_v10.xsd declara maxInclusive con 34 digitos y libxml2 solo
// representa decimales de hasta 24. Sale con 3 si algun archivo no valida.
// No resuelve recursos de red: los esquemas importados se leen del mismo
// directorio que el esquema principal.
// Uso: java scripts/sii-esquema.java esquema.xsd archivo.xml [...]

import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.*;
import java.io.File;

public class ValidaEsquema {
    public static void main(String[] args) throws Exception {
        SchemaFactory sf = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        sf.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        sf.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file");
        Schema schema = sf.newSchema(new File(args[0]));
        int fallas = 0;
        for (int i = 1; i < args.length; i++) {
            Validator v = schema.newValidator();
            v.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            v.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            try {
                v.validate(new StreamSource(new File(args[i])));
                System.out.println("valida=true " + args[i]);
            } catch (org.xml.sax.SAXException e) {
                fallas++;
                System.out.println("valida=false " + args[i] + " " + e.getMessage());
            }
        }
        System.exit(fallas > 0 ? 3 : 0);
    }
}
