// Verificador independiente de firmas XMLDSig para scripts/sii-check.mjs:
// valida cada <Signature> de los archivos dados con javax.xml.crypto de la
// JDK (no con el codigo de Cord). Marca como ID el atributo ID de <Documento>,
// <SetDTE>, <Resultado> (RespuestaDTE), <SetRecibos>, <DocumentoRecibo>
// (EnvioRecibos) y <EnvioLibro> (LibroCompraVenta), como hace el SII. Sale
// con 3 si alguna firma no verifica.
// Uso: java scripts/sii-firmas.java [--sobre] archivo.xml [...]
//
// Con --sobre solo verifica la firma hija del elemento raiz (la del <SetDTE>
// en <EnvioDTE>, la del <Resultado> en <RespuestaDTE>, la del <SetRecibos>
// en <EnvioRecibos>, la del <EnvioLibro> en <LibroCompraVenta>): el DTE y el recibo
// se firma suelto, sin espacios de nombres (convencion del SII, ver
// src/lib/fiscal/latam/sii/envio.ts), y un verificador estandar lo
// canonicalizaria dentro del sobre heredando xmlns y xmlns:xsi; el ejemplo
// oficial F60T33 tampoco verifica asi. El DTE se verifica en su archivo suelto.

import javax.xml.crypto.*;
import javax.xml.crypto.dsig.*;
import javax.xml.crypto.dsig.dom.DOMValidateContext;
import javax.xml.crypto.dsig.keyinfo.*;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;
import java.io.File;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;

public class VerificaFirmas {
    static class Selector extends KeySelector {
        public KeySelectorResult select(KeyInfo ki, Purpose p, AlgorithmMethod m, XMLCryptoContext c) throws KeySelectorException {
            for (Object o : ki.getContent()) {
                if (o instanceof X509Data) for (Object x : ((X509Data) o).getContent())
                    if (x instanceof X509Certificate) { PublicKey k = ((X509Certificate) x).getPublicKey(); return () -> k; }
            }
            for (Object o : ki.getContent()) {
                if (o instanceof KeyValue) try { PublicKey k = ((KeyValue) o).getPublicKey(); return () -> k; } catch (KeyException e) { throw new KeySelectorException(e); }
            }
            throw new KeySelectorException("sin llave");
        }
    }

    public static void main(String[] args) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        int fallas = 0;
        boolean soloSobre = args.length > 0 && args[0].equals("--sobre");
        for (String path : args) {
            if (path.equals("--sobre")) continue;
            Document doc = f.newDocumentBuilder().parse(new File(path));
            for (String tag : new String[]{"Documento", "SetDTE", "Resultado", "SetRecibos", "DocumentoRecibo", "EnvioLibro"}) {
                NodeList l = doc.getElementsByTagNameNS("*", tag);
                for (int i = 0; i < l.getLength(); i++) ((Element) l.item(i)).setIdAttribute("ID", true);
            }
            NodeList firmas = doc.getElementsByTagNameNS(XMLSignature.XMLNS, "Signature");
            XMLSignatureFactory fac = XMLSignatureFactory.getInstance("DOM");
            for (int i = 0; i < firmas.getLength(); i++) {
                if (soloSobre && firmas.item(i).getParentNode() != doc.getDocumentElement()) continue;
                DOMValidateContext ctx = new DOMValidateContext(new Selector(), firmas.item(i));
                ctx.setProperty("org.jcp.xml.dsig.secureValidation", Boolean.FALSE);
                XMLSignature sig = fac.unmarshalXMLSignature(ctx);
                boolean ok = sig.validate(ctx);
                boolean sv = sig.getSignatureValue().validate(ctx);
                Reference ref = (Reference) sig.getSignedInfo().getReferences().get(0);
                boolean rv = ref.validate(ctx);
                String padre = firmas.item(i).getParentNode().getLocalName();
                System.out.println(path.replaceAll(".*/", "") + " firma en <" + padre + "> ref=" + ref.getURI() + " valida=" + ok + " (valor=" + sv + ", digest=" + rv + ")");
                if (!ok) fallas++;
            }
        }
        System.exit(fallas == 0 ? 0 : 3);
    }
}
