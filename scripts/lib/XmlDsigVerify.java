// Verificación XMLDSig de las Facturae firmadas por Cord, con la implementación
// del JDK (javax.xml.crypto.dsig, la de referencia de Apache Santuario). La usa
// `scripts/einvoice-check.mjs`: valida cada referencia (documento enveloped,
// SignedProperties de XAdES y KeyInfo) recanonicalizando por su cuenta, y la
// firma RSA contra el certificado que viaja en KeyInfo. Si la forma canónica
// que escribe Cord no fuera la de C14N, esto falla.
//
//   java scripts/lib/XmlDsigVerify.java archivo.xml [...]
//
// Imprime una línea por archivo: "OK <archivo>" o "FAIL <archivo>: <motivo>".

import java.io.File;
import java.security.Key;
import java.security.cert.X509Certificate;
import java.util.List;
import javax.xml.crypto.AlgorithmMethod;
import javax.xml.crypto.KeySelector;
import javax.xml.crypto.KeySelectorException;
import javax.xml.crypto.KeySelectorResult;
import javax.xml.crypto.XMLCryptoContext;
import javax.xml.crypto.dsig.Reference;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMValidateContext;
import javax.xml.crypto.dsig.keyinfo.KeyInfo;
import javax.xml.crypto.dsig.keyinfo.X509Data;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

public class XmlDsigVerify {
    static final String DS = "http://www.w3.org/2000/09/xmldsig#";

    /** El certificado del propio KeyInfo: se verifica la firma, no la cadena de confianza. */
    static class X509KeySelector extends KeySelector {
        public KeySelectorResult select(KeyInfo keyInfo, KeySelector.Purpose purpose, AlgorithmMethod method, XMLCryptoContext context)
                throws KeySelectorException {
            if (keyInfo == null) throw new KeySelectorException("sin KeyInfo");
            for (Object item : keyInfo.getContent()) {
                if (item instanceof X509Data) {
                    for (Object x : ((X509Data) item).getContent()) {
                        if (x instanceof X509Certificate) {
                            final Key key = ((X509Certificate) x).getPublicKey();
                            return () -> key;
                        }
                    }
                }
            }
            throw new KeySelectorException("KeyInfo sin certificado X.509");
        }
    }

    static void markIds(Element el) {
        if (el.hasAttribute("Id")) el.setIdAttribute("Id", true);
        NodeList children = el.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (children.item(i) instanceof Element) markIds((Element) children.item(i));
        }
    }

    public static void main(String[] args) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        XMLSignatureFactory fac = XMLSignatureFactory.getInstance("DOM");
        int failures = 0;
        for (String path : args) {
            try {
                Document doc = dbf.newDocumentBuilder().parse(new File(path));
                markIds(doc.getDocumentElement());
                NodeList sigs = doc.getElementsByTagNameNS(DS, "Signature");
                if (sigs.getLength() != 1) throw new Exception("se esperaba una ds:Signature y hay " + sigs.getLength());
                DOMValidateContext ctx = new DOMValidateContext(new X509KeySelector(), sigs.item(0));
                XMLSignature signature = fac.unmarshalXMLSignature(ctx);
                boolean ok = signature.validate(ctx);
                StringBuilder why = new StringBuilder();
                if (!signature.getSignatureValue().validate(ctx)) why.append(" SignatureValue no verifica;");
                for (Object r : signature.getSignedInfo().getReferences()) {
                    Reference ref = (Reference) r;
                    if (!ref.validate(ctx)) why.append(" referencia '").append(ref.getURI()).append("' no coincide;");
                }
                @SuppressWarnings("unchecked")
                List<Reference> refs = signature.getSignedInfo().getReferences();
                if (refs.size() != 3) why.append(" se esperaban 3 referencias (documento, SignedProperties, KeyInfo);");
                if (ok && why.length() == 0) System.out.println("OK " + path);
                else { failures++; System.out.println("FAIL " + path + ":" + (why.length() == 0 ? " firma inválida" : why.toString())); }
            } catch (Exception ex) {
                failures++;
                System.out.println("FAIL " + path + ": " + ex.getClass().getSimpleName() + " " + ex.getMessage());
            }
        }
        System.exit(failures == 0 ? 0 : 1);
    }
}
