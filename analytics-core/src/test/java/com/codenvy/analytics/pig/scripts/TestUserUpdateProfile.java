/*
 *
 * CODENVY CONFIDENTIAL
 * ________________
 *
 * [2012] - [2013] Codenvy, S.A.
 * All Rights Reserved.
 * NOTICE: All information contained herein is, and remains
 * the property of Codenvy S.A. and its suppliers,
 * if any. The intellectual and technical concepts contained
 * herein are proprietary to Codenvy S.A.
 * and its suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Codenvy S.A..
 */
package com.codenvy.analytics.pig.scripts;

import com.codenvy.analytics.BaseTest;
import com.codenvy.analytics.Utils;
import com.codenvy.analytics.datamodel.ListValueData;
import com.codenvy.analytics.datamodel.MapValueData;
import com.codenvy.analytics.datamodel.ValueData;
import com.codenvy.analytics.metrics.Metric;
import com.codenvy.analytics.metrics.MetricFilter;
import com.codenvy.analytics.metrics.Parameters;
import com.codenvy.analytics.metrics.UsersProfiles;
import com.codenvy.analytics.pig.PigServer;
import com.codenvy.analytics.pig.scripts.util.Event;
import com.codenvy.analytics.pig.scripts.util.LogGenerator;

import org.apache.pig.data.Tuple;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import static com.mongodb.util.MyAsserts.assertEquals;

/** @author <a href="mailto:abazko@codenvy.com">Anatoliy Bazko</a> */
public class TestUserUpdateProfile extends BaseTest {

    private Map<String, String> params;

    @BeforeClass
    public void prepare() throws IOException {
        params = Utils.newContext();

        List<Event> events = new ArrayList<>();

        events.add(Event.Builder.createUserUpdateProfile("user2@gmail.com", "f2", "l2", "company", "11", "1")
                        .withDate("2013-01-01").build());
        events.add(Event.Builder.createUserUpdateProfile("user1@gmail.com", "f2", "l2", "company", "11", "1")
                        .withDate("2013-01-01").build());
        File log = LogGenerator.generateLog(events);

        Parameters.FROM_DATE.put(params, "20130101");
        Parameters.TO_DATE.put(params, "20130101");
        Parameters.USER.put(params, Parameters.USER_TYPES.REGISTERED.name());
        Parameters.WS.put(params, Parameters.WS_TYPES.ANY.name());
        Parameters.STORAGE_DST.put(params, "testuserupdateprofile");
        Parameters.LOG.put(params, log.getAbsolutePath());

        PigServer.execute(ScriptType.USER_UPDATE_PROFILE, params);


        events.add(Event.Builder.createUserUpdateProfile("user1@gmail.com", "f3", "l3", "company", "22", "2")
                        .withDate("2013-01-02").build());
        events.add(Event.Builder.createUserUpdateProfile("user3@gmail.com", "f4", "l4", "company", "22", "2")
                        .withDate("2013-01-02").build());
        events.add(Event.Builder.createUserUpdateProfile("user4@gmail.com", "f4", "l4", "company", "22", "")
                        .withDate("2013-01-02").build());
        log = LogGenerator.generateLog(events);

        Parameters.FROM_DATE.put(params, "20130102");
        Parameters.TO_DATE.put(params, "20130102");
        Parameters.LOG.put(params, log.getAbsolutePath());

        PigServer.execute(ScriptType.USER_UPDATE_PROFILE, params);
    }

    @Test
    public void testExecute() throws Exception {
        Iterator<Tuple> iterator = PigServer.executeAndReturn(ScriptType.USER_UPDATE_PROFILE, params);

        assertTuples(iterator, new String[]{
                "(user1@gmail.com,(user_email,user1@gmail.com),(user_first_name,f3),(user_last_name,l3)," +
                "(user_company,company),(user_phone,22),(user_job,2))",
                "(user3@gmail.com,(user_email,user3@gmail.com),(user_first_name,f4),(user_last_name,l4)," +
                "(user_company,company),(user_phone,22),(user_job,2))",
                "(user4@gmail.com,(user_email,user4@gmail.com),(user_first_name,f4),(user_last_name,l4)," +
                "(user_company,company),(user_phone,22),(user_job,))"});
    }

    @Test
    public void testAllProfiles() throws Exception {
        Map<String, String> context = Utils.newContext();
        Parameters.FROM_DATE.put(context, "20131101");
        Parameters.TO_DATE.put(context, "20131101");

        Metric metric = new TestUserProfile();

        ListValueData value = (ListValueData)metric.getValue(context);
        assertEquals(value.size(), 4);

        for (ValueData object : value.getAll()) {
            MapValueData item = (MapValueData)object;
            Map<String, ValueData> all = item.getAll();

            if (all.get("user_email").getAsString().equals("user1@gmail.com")) {
                assertEquals(all.get("user_last_name").getAsString(), "l3");
                assertEquals(all.get("user_company").getAsString(), "company");
                assertEquals(all.get("user_phone").getAsString(), "22");
                assertEquals(all.get("user_job").getAsString(), "2");

            } else if (all.get("user_email").getAsString().equals("user2@gmail.com")) {
                assertEquals(all.get("user_first_name").getAsString(), "f2");
                assertEquals(all.get("user_last_name").getAsString(), "l2");
                assertEquals(all.get("user_company").getAsString(), "company");
                assertEquals(all.get("user_phone").getAsString(), "11");
                assertEquals(all.get("user_job").getAsString(), "1");

            } else if (all.get("user_email").getAsString().equals("user3@gmail.com")) {
                assertEquals(all.get("user_first_name").getAsString(), "f4");
                assertEquals(all.get("user_last_name").getAsString(), "l4");
                assertEquals(all.get("user_company").getAsString(), "company");
                assertEquals(all.get("user_phone").getAsString(), "22");
                assertEquals(all.get("user_job").getAsString(), "2");

            } else if (all.get("user_email").getAsString().equals("user4@gmail.com")) {
                assertEquals(all.get("user_first_name").getAsString(), "f4");
                assertEquals(all.get("user_last_name").getAsString(), "l4");
                assertEquals(all.get("user_company").getAsString(), "company");
                assertEquals(all.get("user_phone").getAsString(), "22");
                assertEquals(all.get("user_job").getAsString(), "");
            }
        }
    }

    @Test
    public void testSingleProfile() throws Exception {
        Map<String, String> context = Utils.newContext();
        Parameters.FROM_DATE.put(context, "20131101");
        Parameters.TO_DATE.put(context, "20131101");
        MetricFilter.USER.put(context, "user1@gmail.com");

        Metric metric = new TestUserProfile();

        ListValueData value = (ListValueData)metric.getValue(context);
        assertEquals(value.size(), 1);

        MapValueData item = (MapValueData)value.getAll().get(0);
        Map<String, ValueData> all = item.getAll();

        assertEquals(all.get("user_email").getAsString(), "user1@gmail.com");
        assertEquals(all.get("user_first_name").getAsString(), "f3");
        assertEquals(all.get("user_last_name").getAsString(), "l3");
        assertEquals(all.get("user_company").getAsString(), "company");
        assertEquals(all.get("user_phone").getAsString(), "22");
        assertEquals(all.get("user_job").getAsString(), "2");
    }

    public class TestUserProfile extends UsersProfiles {

        @Override
        public String getStorageTable() {
            return "testuserupdateprofile";
        }
    }
}
