// Verificación INDEPENDIENTE de las firmas que arma el riel DIAN, con el
// validador XMLDSig del JDK (javax.xml.crypto.dsig, Apache Santuario): la
// canonicalización, los resúmenes de cada referencia y el valor de la firma
// los recalcula una implementación que no es la de Cord.
//
//   java scripts/dian-verificar-firma.java archivo.xml [archivo2.xml …]
//
// Para cada archivo, verifica la PRIMERA ds:Signature del documento (la del
// documento electrónico o la del contenedor; las de los documentos adjuntos
// en CDATA son texto) con la llave pública de su certificado: el
// ds:X509Certificate del KeyInfo o, en un sobre SOAP con WS-Security, el
// wsse:BinarySecurityToken. Sale con código 1 si alguna referencia o la firma
// no valida. Lo corre scripts/dian-check.mjs (security:dian).
import java.io.ByteArrayInputStream;
import java.io.File;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Base64;
import java.util.Iterator;
import javax.xml.crypto.dsig.Reference;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMValidateContext;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

public class VerificarFirmaDian {
    static final String WSU = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
    static final String WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";

    public static void main(String[] args) throws Exception {
        boolean todo = true;
        for (String ruta : args) {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setNamespaceAware(true);
            Document doc = f.newDocumentBuilder().parse(new File(ruta));
            NodeList todos = doc.getElementsByTagNameNS("*", "*");
            for (int i = 0; i < todos.getLength(); i++) {
                Element e = (Element) todos.item(i);
                if (e.hasAttributeNS(null, "Id")) e.setIdAttributeNS(null, "Id", true);
                if (e.hasAttributeNS(WSU, "Id")) e.setIdAttributeNS(WSU, "Id", true);
            }
            Element firma = (Element) doc.getElementsByTagNameNS(XMLSignature.XMLNS, "Signature").item(0);
            if (firma == null) { System.out.println(ruta + ": SIN FIRMA"); todo = false; continue; }
            Element certEl = (Element) firma.getElementsByTagNameNS(XMLSignature.XMLNS, "X509Certificate").item(0);
            if (certEl == null) certEl = (Element) doc.getElementsByTagNameNS(WSSE, "BinarySecurityToken").item(0);
            byte[] der = Base64.getMimeDecoder().decode(certEl.getTextContent());
            X509Certificate cert = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
            DOMValidateContext ctx = new DOMValidateContext(cert.getPublicKey(), firma);
            XMLSignature sig = XMLSignatureFactory.getInstance("DOM").unmarshalXMLSignature(ctx);
            boolean valida = sig.validate(ctx);
            StringBuilder detalle = new StringBuilder();
            Iterator<?> it = sig.getSignedInfo().getReferences().iterator();
            while (it.hasNext()) {
                Reference r = (Reference) it.next();
                detalle.append(" ref[").append(r.getURI()).append("]=").append(r.validate(ctx) ? "ok" : "MAL");
            }
            detalle.append(" valor=").append(sig.getSignatureValue().validate(ctx) ? "ok" : "MAL");
            System.out.println(ruta + ": " + (valida ? "VALIDA" : "INVALIDA") + detalle);
            todo &= valida;
        }
        System.exit(todo ? 0 : 1);
    }
}
